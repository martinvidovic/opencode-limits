import type {
  ActiveConnection,
  ConnectionCredential,
  ProviderFailure,
} from './model.js'

const expiryBufferMs = 60_000

export const reauthenticationRequired = {
  status: 'failure',
  failure: { code: 'reauthentication-required' },
} as const

export const unsupportedAuth = {
  status: 'failure',
  failure: { code: 'unsupported-auth' },
} as const

export type OAuthConnectionCredential = Extract<
  ConnectionCredential,
  { readonly type: 'oauth' }
>

/**
 * Resolves the active connection to a usable OAuth credential. The host
 * refreshes near-expiry tokens while resolving; any refresh or lookup error
 * becomes a bounded failure. Access tokens are checked for presence and expiry
 * (an `expires` of 0 never expires) unless the provider opts out because it
 * authenticates with another token.
 */
export async function resolveOAuthConnection(
  connection: ActiveConnection,
  options: { readonly now: () => number } | { readonly checkAccess: false }
): Promise<
  | {
      readonly status: 'success'
      readonly credential: OAuthConnectionCredential
    }
  | { readonly status: 'failure'; readonly failure: ProviderFailure }
> {
  let credential: ConnectionCredential | undefined
  try {
    credential = await connection.resolve()
  } catch {
    return reauthenticationRequired
  }
  if (credential === undefined) return reauthenticationRequired
  if (credential.type !== 'oauth') return unsupportedAuth
  if ('now' in options && isAccessUnusable(credential, options.now())) {
    return reauthenticationRequired
  }
  return { status: 'success', credential }
}

function isAccessUnusable(
  credential: OAuthConnectionCredential,
  now: number
): boolean {
  return (
    credential.access.length === 0 ||
    (credential.expires !== 0 && credential.expires <= now + expiryBufferMs)
  )
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
