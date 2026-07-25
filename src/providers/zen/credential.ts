import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  CredentialReader,
  DisplayOnlyAccountContext,
} from '../../core/model.js'

const officialOrigin = 'https://console.opencode.ai'
const expiryBufferMs = 60_000

export interface IZenCredential {
  readonly accessToken: string
  readonly organizationId: string
  readonly account: DisplayOnlyAccountContext
}

interface IActiveAccount {
  readonly email: string
  readonly url: string
  readonly accessToken: string
  readonly tokenExpiry?: number
  readonly organizationId?: string
}

export function createZenCredentialReader(
  input: {
    readonly databasePath?: string
    readonly readActiveAccount?: (
      path: string
    ) => Promise<IActiveAccount | undefined>
    readonly now?: () => number
  } = {}
): CredentialReader<IZenCredential> {
  const path = input.databasePath ?? defaultDatabasePath()
  const readActiveAccount = input.readActiveAccount ?? readAccountFromDatabase
  const now = input.now ?? Date.now

  return {
    read: async () => {
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
        account.accessToken.length === 0 ||
        account.organizationId === undefined ||
        account.organizationId.length === 0 ||
        (account.tokenExpiry !== undefined &&
          account.tokenExpiry <= now() + expiryBufferMs)
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
  // Node 22 supplies this built-in; the dynamic import keeps Node 20 test hosts loadable.
  // eslint-disable-next-line import-x/no-unresolved
  const { DatabaseSync } = await import('node:sqlite')
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    const row = database
      .prepare(
        `SELECT account.email, account.url, account.access_token, account.token_expiry,
                account_state.active_org_id
         FROM account_state
         JOIN account ON account.id = account_state.active_account_id
         WHERE account_state.id = 1`
      )
      .get() as Record<string, unknown> | undefined
    if (row === undefined) return undefined
    return {
      email: stringValue(row.email),
      url: stringValue(row.url),
      accessToken: stringValue(row.access_token),
      ...optionalFiniteNumber('tokenExpiry', row.token_expiry),
      ...optionalString('organizationId', row.active_org_id),
    }
  } finally {
    database.close()
  }
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
