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

export type OAuthConnectionCredential = Extract<
  ConnectionCredential,
  { readonly type: 'oauth' }
>

/**
 * Resolves the active connection to usable OAuth material. The host refreshes
 * near-expiry tokens while resolving; any refresh or lookup error becomes a
 * bounded failure. An `expires` of 0 means the token has no expiry.
 */
export async function resolveOAuthConnection(
  connection: ActiveConnection,
  now: number
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
  if (credential.type !== 'oauth') {
    return { status: 'failure', failure: { code: 'unsupported-auth' } }
  }
  if (
    credential.access.length === 0 ||
    (credential.expires !== 0 && credential.expires <= now + expiryBufferMs)
  ) {
    return reauthenticationRequired
  }
  return { status: 'success', credential }
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
