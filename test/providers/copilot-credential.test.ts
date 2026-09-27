import { describe, expect, it } from 'vitest'

import type {
  ActiveConnection,
  ConnectionCredential,
} from '../../src/core/model.js'
import { createCopilotCredentialReader } from '../../src/providers/copilot/credential.js'

const signal = new AbortController().signal

describe('GitHub Copilot credential reader', () => {
  it('uses the GitHub OAuth token of the active GitHub.com connection', async () => {
    const reader = createCopilotCredentialReader()

    await expect(
      reader.read({
        connection: connectionResolving({
          type: 'oauth',
          methodID: 'device',
          access: 'github-token-canary',
          refresh: 'github-token-canary',
          expires: 0,
          metadata: {
            apiEndpoint: 'https://api.individual.githubcopilot.com',
          },
        }),
        signal,
      })
    ).resolves.toEqual({
      status: 'success',
      credential: { accessToken: 'github-token-canary' },
    })
  })

  it('prefers the GitHub token over a legacy short-lived Copilot token and ignores its stale expiry', async () => {
    const reader = createCopilotCredentialReader()

    await expect(
      reader.read({
        connection: connectionResolving({
          type: 'oauth',
          methodID: 'device',
          access: 'copilot-session-canary',
          refresh: 'github-token-canary',
          expires: 1,
        }),
        signal,
      })
    ).resolves.toEqual({
      status: 'success',
      credential: { accessToken: 'github-token-canary' },
    })
  })

  it('refuses GitHub Enterprise and key connections before any request', async () => {
    const reader = createCopilotCredentialReader()
    const unsupported = {
      status: 'failure',
      failure: { code: 'unsupported-auth' },
    }

    await expect(
      reader.read({
        connection: connectionResolving({
          type: 'oauth',
          access: 'ghe-token-canary',
          refresh: 'ghe-token-canary',
          expires: 0,
          metadata: { enterpriseUrl: 'company.ghe.com' },
        }),
        signal,
      })
    ).resolves.toEqual(unsupported)
    await expect(
      reader.read({
        connection: connectionResolving({
          type: 'oauth',
          access: 'ghe-token-canary',
          refresh: 'ghe-token-canary',
          expires: 0,
          metadata: { apiEndpoint: 'https://copilot-api.company.ghe.com' },
        }),
        signal,
      })
    ).resolves.toEqual(unsupported)
    await expect(
      reader.read({
        connection: connectionResolving({ type: 'key', key: 'key-canary' }),
        signal,
      })
    ).resolves.toEqual(unsupported)
  })

  it('requires reauthentication for missing tokens and unresolvable connections', async () => {
    const reader = createCopilotCredentialReader()
    const reauthentication = {
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    }
    const read = (connection: ActiveConnection) =>
      reader.read({ connection, signal })

    await expect(
      read(
        connectionResolving({
          type: 'oauth',
          access: 'copilot-session-canary',
          refresh: '',
          expires: 0,
        })
      )
    ).resolves.toEqual(reauthentication)
    await expect(read(connectionResolving(undefined))).resolves.toEqual(
      reauthentication
    )
    await expect(
      read({ resolve: () => Promise.reject(new Error('token-canary')) })
    ).resolves.toEqual(reauthentication)
  })
})

function connectionResolving(
  credential: ConnectionCredential | undefined
): ActiveConnection {
  return { resolve: () => Promise.resolve(credential) }
}
