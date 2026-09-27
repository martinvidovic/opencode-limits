import type {
  ConnectionCredential,
  CredentialReader,
  DisplayOnlyAccountContext,
} from '../../core/model.js'

const expiryBufferMs = 60_000
// OpenCode issues ChatGPT OAuth credentials only through these methods; any
// other OAuth token for the openai integration must not reach chatgpt.com.
const chatGptMethodIds: ReadonlySet<string> = new Set([
  'chatgpt-browser',
  'chatgpt-headless',
])

export interface ICodexCredential {
  readonly accessToken: string
  readonly accountId?: string
  readonly account?: DisplayOnlyAccountContext
}

export function createCodexCredentialReader(
  input: {
    readonly now?: () => number
  } = {}
): CredentialReader<ICodexCredential> {
  const now = input.now ?? Date.now

  return {
    read: async ({ connection }) => {
      let credential: ConnectionCredential | undefined
      try {
        credential = await connection.resolve()
      } catch {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }
      if (credential === undefined) {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }
      if (
        credential.type !== 'oauth' ||
        credential.methodID === undefined ||
        !chatGptMethodIds.has(credential.methodID)
      ) {
        return { status: 'failure', failure: { code: 'unsupported-auth' } }
      }
      if (
        credential.access.length === 0 ||
        credential.expires <= now() + expiryBufferMs
      ) {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }

      const accountId = credential.metadata?.accountID
      const account = decodeAccountContext(credential.access)
      return {
        status: 'success',
        credential: {
          accessToken: credential.access,
          ...(typeof accountId === 'string' && accountId.length > 0
            ? { accountId }
            : {}),
          ...(account === undefined ? {} : { account }),
        },
      }
    },
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
