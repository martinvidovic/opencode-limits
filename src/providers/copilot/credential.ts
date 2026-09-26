import {
  reauthenticationRequired,
  resolveOAuthConnection,
  unsupportedAuth,
} from '../../core/connection-credential.js'
import type {
  CredentialReader,
  DisplayOnlyAccountContext,
} from '../../core/model.js'

export interface ICopilotCredential {
  readonly accessToken: string
  readonly account?: DisplayOnlyAccountContext
}

/**
 * Reads the active GitHub Copilot connection. OpenCode keeps the GitHub OAuth
 * token in `refresh` (new logins also copy it to `access`; imported v1 records
 * keep a short-lived Copilot token there), and that token is what the usage
 * endpoint accepts. It does not expire, so `expires` is ignored.
 */
export function createCopilotCredentialReader(): CredentialReader<ICopilotCredential> {
  return {
    read: async ({ connection }) => {
      const resolved = await resolveOAuthConnection(connection, {
        checkAccess: false,
      })
      if (resolved.status === 'failure') return resolved
      const { credential } = resolved
      // Enterprise hosts use a different API origin; never send their token to
      // the public endpoint.
      if (!isGitHubDotCom(credential.metadata)) {
        return unsupportedAuth
      }
      if (credential.refresh.length === 0) return reauthenticationRequired

      return {
        status: 'success',
        credential: { accessToken: credential.refresh },
      }
    },
  }
}

function isGitHubDotCom(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  if (metadata?.enterpriseUrl !== undefined) return false
  const endpoint = metadata?.apiEndpoint
  if (endpoint === undefined) return true
  if (typeof endpoint !== 'string') return false
  try {
    const { protocol, hostname } = new URL(endpoint)
    return (
      protocol === 'https:' &&
      (hostname === 'api.githubcopilot.com' ||
        hostname.endsWith('.githubcopilot.com'))
    )
  } catch {
    return false
  }
}
