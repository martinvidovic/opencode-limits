import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  CredentialReader,
  DisplayOnlyAccountContext,
  ProviderFailure,
} from '../../core/model.js'

const officialOrigin = 'https://console.opencode.ai'
const expiryBufferMs = 60_000
const requestTimeoutMs = 8_000
const consoleClientId = 'opencode-cli'

export interface IZenCredential {
  readonly accessToken: string
  readonly organizationId: string
  readonly account: DisplayOnlyAccountContext
}

interface IActiveAccount {
  readonly id?: string
  readonly email: string
  readonly url: string
  readonly accessToken: string
  readonly refreshToken?: string
  readonly tokenExpiry?: number
  readonly organizationId?: string
}

interface IRefreshedToken {
  readonly accessToken: string
  readonly refreshToken: string
  readonly tokenExpiry: number
}

export function createZenCredentialReader(
  input: {
    readonly databasePath?: string
    readonly readActiveAccount?: (
      path: string
    ) => Promise<IActiveAccount | undefined>
    readonly persistRefreshedToken?: (
      path: string,
      accountId: string,
      token: IRefreshedToken
    ) => Promise<void>
    readonly fetch?: typeof fetch
    readonly now?: () => number
  } = {}
): CredentialReader<IZenCredential> {
  const path = input.databasePath ?? defaultDatabasePath()
  const readActiveAccount = input.readActiveAccount ?? readAccountFromDatabase
  const persistRefreshedToken =
    input.persistRefreshedToken ?? persistTokenToDatabase
  const performFetch = input.fetch ?? fetch
  const now = input.now ?? Date.now

  return {
    read: async ({ signal }) => {
      let account: IActiveAccount | undefined
      try {
        account = await readActiveAccount(path)
      } catch {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }
      if (account === undefined || !isOfficialOrigin(account.url)) {
        return { status: 'failure', failure: { code: 'unavailable' } }
      }
      if (
        account.tokenExpiry !== undefined &&
        account.tokenExpiry <= now() + expiryBufferMs
      ) {
        const refreshed = await refreshAccount({
          account,
          path,
          fetch: performFetch,
          persistRefreshedToken,
          now,
          signal,
        })
        if (refreshed.status === 'failure') return refreshed
        const { account: refreshedAccount } = refreshed
        account = refreshedAccount
      }
      if (
        account.accessToken.length === 0 ||
        account.organizationId === undefined ||
        account.organizationId.length === 0
      ) {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }

      return {
        status: 'success',
        credential: {
          accessToken: account.accessToken,
          organizationId: account.organizationId,
          account: { identity: account.email },
        },
      }
    },
  }
}

function defaultDatabasePath(): string {
  return join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
}

async function readAccountFromDatabase(
  path: string
): Promise<IActiveAccount | undefined> {
  // eslint-disable-next-line import-x/no-unresolved
  const { Database } = await import('bun:sqlite')
  const database = new Database(path, { readonly: true })
  try {
    const row = database
      .query(
        `SELECT account.id, account.email, account.url, account.access_token,
                account.refresh_token, account.token_expiry,
                 account_state.active_org_id
         FROM account_state
         JOIN account ON account.id = account_state.active_account_id
         WHERE account_state.id = 1`
      )
      .get()
    if (row === undefined) return undefined
    return {
      ...optionalString('id', row.id),
      email: stringValue(row.email),
      url: stringValue(row.url),
      accessToken: stringValue(row.access_token),
      ...optionalString('refreshToken', row.refresh_token),
      ...optionalFiniteNumber('tokenExpiry', row.token_expiry),
      ...optionalString('organizationId', row.active_org_id),
    }
  } finally {
    database.close()
  }
}

async function persistTokenToDatabase(
  path: string,
  accountId: string,
  token: IRefreshedToken
): Promise<void> {
  // eslint-disable-next-line import-x/no-unresolved
  const { Database } = await import('bun:sqlite')
  const database = new Database(path)
  try {
    database
      .query(
        `UPDATE account
         SET access_token = ?, refresh_token = ?, token_expiry = ?, time_updated = ?
         WHERE id = ?`
      )
      .run(
        token.accessToken,
        token.refreshToken,
        token.tokenExpiry,
        Date.now(),
        accountId
      )
  } finally {
    database.close()
  }
}

async function refreshAccount(input: {
  readonly account: IActiveAccount
  readonly path: string
  readonly fetch: typeof fetch
  readonly persistRefreshedToken: (
    path: string,
    accountId: string,
    token: IRefreshedToken
  ) => Promise<void>
  readonly now: () => number
  readonly signal: AbortSignal
}): Promise<
  | { readonly status: 'success'; readonly account: IActiveAccount }
  | { readonly status: 'failure'; readonly failure: ProviderFailure }
> {
  const { account } = input
  if (!account.id || !account.refreshToken) {
    return {
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    }
  }

  let response: Response
  try {
    response = await input.fetch(`${account.url}/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: consoleClientId,
      }),
      signal: AbortSignal.any([
        input.signal,
        AbortSignal.timeout(requestTimeoutMs),
      ]),
    })
  } catch {
    return { status: 'failure', failure: { code: 'network' } }
  }
  if (!response.ok) {
    const code = [400, 401, 403].includes(response.status)
      ? 'reauthentication-required'
      : 'unavailable'
    return { status: 'failure', failure: { code } }
  }

  let value: unknown
  try {
    value = await response.json()
  } catch {
    return { status: 'failure', failure: { code: 'invalid-response' } }
  }
  if (!isTokenRefresh(value)) {
    return { status: 'failure', failure: { code: 'invalid-response' } }
  }

  const token = {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    tokenExpiry: input.now() + value.expires_in * 1_000,
  }
  try {
    await input.persistRefreshedToken(input.path, account.id, token)
  } catch {
    return { status: 'failure', failure: { code: 'unavailable' } }
  }
  return {
    status: 'success',
    account: {
      ...account,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiry: token.tokenExpiry,
    },
  }
}

function isTokenRefresh(value: unknown): value is {
  readonly access_token: string
  readonly refresh_token: string
  readonly expires_in: number
} {
  if (typeof value !== 'object' || value === null) return false
  const token = value as Record<string, unknown>
  return (
    typeof token.access_token === 'string' &&
    token.access_token.length > 0 &&
    typeof token.refresh_token === 'string' &&
    token.refresh_token.length > 0 &&
    typeof token.expires_in === 'number' &&
    Number.isFinite(token.expires_in) &&
    token.expires_in > 0
  )
}

function isOfficialOrigin(value: string): boolean {
  try {
    return new URL(value).origin === officialOrigin
  } catch {
    return false
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalString<TName extends string>(
  name: TName,
  value: unknown
): { readonly [Key in TName]?: string } {
  return typeof value === 'string' && value.length > 0
    ? ({ [name]: value } as { readonly [Key in TName]: string })
    : {}
}

function optionalFiniteNumber<TName extends string>(
  name: TName,
  value: unknown
): { readonly [Key in TName]?: number } {
  return typeof value === 'number' && Number.isFinite(value)
    ? ({ [name]: value } as { readonly [Key in TName]: number })
    : {}
}
