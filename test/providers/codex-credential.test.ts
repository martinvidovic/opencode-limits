import { describe, expect, it } from 'vitest'

import type {
  ActiveConnection,
  ConnectionCredential,
} from '../../src/core/model.js'
import { createCodexCredentialReader } from '../../src/providers/codex/credential.js'

const signal = new AbortController().signal

describe('Codex credential reader', () => {
  it('resolves the active OpenAI OAuth connection and exposes only the validated credential', async () => {
    const reader = createCodexCredentialReader({ now: () => 1_000_000_000_000 })

    await expect(
      reader.read({
        connection: connectionResolving({
          type: 'oauth',
          methodID: 'chatgpt-browser',
          access: tokenWithClaims(),
          refresh: 'refresh-canary',
          expires: 2_000_000_000_000,
          metadata: { accountID: 'account-canary', other: 'metadata-canary' },
        }),
        signal,
      })
    ).resolves.toEqual({
      status: 'success',
      credential: {
        accessToken: tokenWithClaims(),
        accountId: 'account-canary',
        account: {
          identity: 'account@example.test',
          planOrOrganization: 'ChatGPT Plus',
        },
      },
    })
  })

  it('omits the account header value when the connection has no account ID', async () => {
    const reader = createCodexCredentialReader({ now: () => 0 })

    await expect(
      reader.read({
        connection: connectionResolving({
          type: 'oauth',
          methodID: 'chatgpt-headless',
          access: 'header.e30.signature',
          refresh: 'refresh-canary',
          expires: 2_000_000_000_000,
          metadata: { accountID: 42 },
        }),
        signal,
      })
    ).resolves.toEqual({
      status: 'success',
      credential: { accessToken: 'header.e30.signature' },
    })
  })

  it.each(['chatgpt-browser', 'chatgpt-headless'])(
    'accepts the ChatGPT %s OAuth method',
    async (methodID) => {
      const reader = createCodexCredentialReader({ now: () => 0 })

      await expect(
        reader.read({
          connection: connectionResolving({
            type: 'oauth',
            methodID,
            access: 'header.e30.signature',
            refresh: 'refresh-canary',
            expires: 2_000_000_000_000,
          }),
          signal,
        })
      ).resolves.toEqual({
        status: 'success',
        credential: { accessToken: 'header.e30.signature' },
      })
    }
  )

  it('refuses OAuth credentials from any other or a missing method', async () => {
    const reader = createCodexCredentialReader({ now: () => 0 })
    const oauth = {
      type: 'oauth' as const,
      access: 'other-access-canary',
      refresh: 'refresh-canary',
      expires: 2_000_000_000_000,
    }

    for (const credential of [
      { ...oauth, methodID: 'device' },
      { ...oauth, methodID: 'chatgpt' },
      oauth,
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        reader.read({ connection: connectionResolving(credential), signal })
      ).resolves.toEqual({
        status: 'failure',
        failure: { code: 'unsupported-auth' },
      })
    }
  })

  it('returns only bounded failures for key, missing, stale, and unresolvable connections', async () => {
    const reader = createCodexCredentialReader({ now: () => 100 })
    const read = (connection: ActiveConnection) =>
      reader.read({ connection, signal })

    await expect(
      read(connectionResolving({ type: 'key', key: 'key-canary' }))
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'unsupported-auth' },
    })
    await expect(read(connectionResolving(undefined))).resolves.toEqual({
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    })
    await expect(
      read(
        connectionResolving({
          type: 'oauth',
          methodID: 'chatgpt-browser',
          access: 'secret-canary',
          refresh: 'refresh-canary',
          expires: 100,
        })
      )
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    })
    await expect(
      read(
        connectionResolving({
          type: 'oauth',
          methodID: 'chatgpt-browser',
          access: '',
          refresh: 'refresh-canary',
          expires: 2_000_000_000_000,
        })
      )
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    })
    await expect(
      read({
        resolve: () => Promise.reject(new Error('refresh-canary failed')),
      })
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    })
  })
})

function connectionResolving(
  credential: ConnectionCredential | undefined
): ActiveConnection {
  return { resolve: () => Promise.resolve(credential) }
}

function tokenWithClaims(): string {
  const payload = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/profile': { email: 'account@example.test' },
      'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' },
    })
  ).toString('base64url')
  return `header.${payload}.signature`
}
