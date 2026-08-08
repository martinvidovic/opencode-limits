import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  CredentialReader,
  DisplayOnlyAccountContext,
} from '../../core/model.js'

const expiryBufferMs = 60_000

export interface ICodexCredential {
  readonly accessToken: string
  readonly accountId?: string
  readonly account?: DisplayOnlyAccountContext
}

export function createCodexCredentialReader(
  input: {
    readonly environment?: NodeJS.ProcessEnv
    readonly readFile?: typeof readFile
    readonly now?: () => number
  } = {}
): CredentialReader<ICodexCredential> {
  const environment = input.environment ?? process.env
  const read = input.readFile ?? readFile
  const now = input.now ?? Date.now

  return {
    read: async () => {
      let content: string
      try {
        content =
          environment.OPENCODE_AUTH_CONTENT ??
          (await read(authPath(environment), 'utf8'))
      } catch {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }

      const record = parseOpenAiRecord(content)
      if (record === undefined) {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }
      if (record.type !== 'oauth') {
        return { status: 'failure', failure: { code: 'unsupported-auth' } }
      }
      if (
        record.access === undefined ||
        record.expires === undefined ||
        record.expires <= now() + expiryBufferMs
      ) {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }

      const account = decodeAccountContext(record.access)
      return {
        status: 'success',
        credential: {
          accessToken: record.access,
          ...(record.accountId === undefined
            ? {}
            : { accountId: record.accountId }),
          ...(account === undefined ? {} : { account }),
        },
      }
    },
  }
}

function authPath(environment: NodeJS.ProcessEnv): string {
  const dataHome =
    environment.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')
  return join(dataHome, 'opencode', 'auth.json')
}

function parseOpenAiRecord(content: string):
  | {
      readonly type: 'oauth' | 'api'
      readonly access?: string
      readonly accountId?: string
      readonly expires?: number
    }
  | undefined {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!isRecord(parsed) || !isRecord(parsed.openai)) return undefined
    const record = parsed.openai
    if (record.type !== 'oauth' && record.type !== 'api') return undefined
    return {
      type: record.type,
      ...(typeof record.access === 'string' && record.access.length > 0
        ? { access: record.access }
        : {}),
      ...(typeof record.accountId === 'string' && record.accountId.length > 0
        ? { accountId: record.accountId }
        : {}),
      ...(typeof record.expires === 'number' && Number.isFinite(record.expires)
        ? { expires: record.expires }
        : {}),
    }
  } catch {
    return undefined
  }
}

function decodeAccountContext(
  accessToken: string
): DisplayOnlyAccountContext | undefined {
  const payload = accessToken.split('.')[1]
  if (payload === undefined) return undefined
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as unknown
    if (!isRecord(claims)) return undefined
    const profile = claims['https://api.openai.com/profile']
    const auth = claims['https://api.openai.com/auth']
    const identity =
      typeof claims.email === 'string'
        ? claims.email
        : isRecord(profile) && typeof profile.email === 'string'
          ? profile.email
          : undefined
    if (identity === undefined || identity.length === 0) return undefined
    const plan =
      isRecord(auth) && typeof auth.chatgpt_plan_type === 'string'
        ? auth.chatgpt_plan_type
        : undefined
    return {
      identity,
      ...(plan === undefined
        ? {}
        : {
            planOrOrganization: `ChatGPT ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`,
          }),
    }
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
