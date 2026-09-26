import {
  nonEmptyString,
  reauthenticationRequired,
  resolveOAuthConnection,
  unsupportedAuth,
} from '../../core/connection-credential.js'
import type {
  CredentialReader,
  DisplayOnlyAccountContext,
} from '../../core/model.js'
import { zenConsoleBaseUrl } from './endpoints.js'

export interface IZenCredential {
  readonly accessToken: string
  readonly organizationId: string
  readonly account: DisplayOnlyAccountContext
}

/**
 * Reads the active OpenCode Console connection and the organization selected
 * in it. The host refreshes and stores tokens while resolving; this reader
 * never mutates credentials.
 */
export function createZenCredentialReader(
  input: {
    readonly now?: () => number
  } = {}
): CredentialReader<IZenCredential> {
  const now = input.now ?? Date.now

  return {
    read: async ({ connection }) => {
      // Service-account keys carry no user or organization for usage reports.
      const resolved = await resolveOAuthConnection(connection, { now })
      if (resolved.status === 'failure') return resolved
      const { metadata } = resolved.credential
      if (!isOfficialServer(metadata?.server)) {
        return unsupportedAuth
      }

      const organizationId = nonEmptyString(metadata?.orgID)
      const email = nonEmptyString(metadata?.email)
      if (organizationId === undefined || email === undefined) {
        return reauthenticationRequired
      }
      return {
        status: 'success',
        credential: {
          accessToken: resolved.credential.access,
          organizationId,
          account: { identity: email },
        },
      }
    },
  }
}

// OpenCode connects to its default Console when a login records no server.
function isOfficialServer(server: unknown): boolean {
  if (server === undefined) return true
  return (
    typeof server === 'string' &&
    server.replace(/\/+$/u, '') === zenConsoleBaseUrl
  )
}
