import {
  nonEmptyString,
  resolveOAuthConnection,
} from '../../core/connection-credential.js'
import type {
  CredentialReader,
  DisplayOnlyAccountContext,
} from '../../core/model.js'

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
      const resolved = await resolveOAuthConnection(connection, now())
      if (resolved.status === 'failure') return resolved
      const { credential } = resolved

      const accountId = nonEmptyString(credential.metadata?.accountID)
      const account = decodeAccountContext(credential.access)
      return {
        status: 'success',
        credential: {
          accessToken: credential.access,
          ...(accountId === undefined ? {} : { accountId }),
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
