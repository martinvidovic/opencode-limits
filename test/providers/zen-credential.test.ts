import { describe, expect, it } from 'vitest'

import type {
  ActiveConnection,
  ConnectionCredential,
} from '../../src/core/model.js'
import { createZenCredentialReader } from '../../src/providers/zen/credential.js'

const signal = new AbortController().signal

describe('OpenCode Zen credential reader', () => {
  it('returns the active official Console account and its selected organization', async () => {
    const reader = createZenCredentialReader({ now: () => 1_000_000_000_000 })

    await expect(
      reader.read({
        connection: connectionResolving(
          consoleCredential({ server: 'https://opencode.ai/console/' })
        ),
        signal,
      })
    ).resolves.toEqual({
      status: 'success',
      credential: {
        accessToken: 'access-canary',
        organizationId: 'org_selected',
        account: { identity: 'account@example.test' },
      },
    })
  })

  it('uses the default Console server when the connection names none', async () => {
    const reader = createZenCredentialReader({ now: () => 0 })
    const { server: _server, ...metadata } = consoleCredential().metadata

    await expect(
      reader.read({
        connection: connectionResolving({ ...consoleCredential(), metadata }),
        signal,
      })
    ).resolves.toMatchObject({ status: 'success' })
  })

  it('refuses custom servers and service-account keys before any request', async () => {
    const reader = createZenCredentialReader({ now: () => 0 })

    await expect(
      reader.read({
        connection: connectionResolving(
          consoleCredential({ server: 'https://console.example.test' })
        ),
        signal,
      })
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'unsupported-auth' },
    })
    await expect(
      reader.read({
        connection: connectionResolving({ type: 'key', key: 'key-canary' }),
        signal,
      })
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'unsupported-auth' },
    })
  })

  it('requires reauthentication for stale, incomplete, missing, or unrefreshable connections', async () => {
    const reader = createZenCredentialReader({ now: () => 1_000_000_000_000 })
    const reauthentication = {
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    }
    const read = (connection: ActiveConnection) =>
      reader.read({ connection, signal })

    await expect(
      read(
        connectionResolving({
          ...consoleCredential(),
          expires: 1_000_000_000_000,
        })
      )
    ).resolves.toEqual(reauthentication)
    await expect(
      read(connectionResolving(consoleCredential({ orgID: undefined })))
    ).resolves.toEqual(reauthentication)
    await expect(
      read(connectionResolving(consoleCredential({ email: 42 })))
    ).resolves.toEqual(reauthentication)
    await expect(read(connectionResolving(undefined))).resolves.toEqual(
      reauthentication
    )
    await expect(
      read({
        resolve: () =>
          Promise.reject(new Error('refresh failed for refresh-canary')),
      })
    ).resolves.toEqual(reauthentication)
  })
})

function consoleCredential(metadata: Record<string, unknown> = {}) {
  return {
    type: 'oauth' as const,
    methodID: 'device',
    access: 'access-canary',
    refresh: 'refresh-canary',
    expires: 2_000_000_000_000,
    metadata: {
      server: 'https://opencode.ai/console',
      accountID: 'account-canary',
      email: 'account@example.test',
      orgID: 'org_selected',
      orgName: 'Selected Org',
      ...metadata,
    },
  }
}

function connectionResolving(
  credential: ConnectionCredential | undefined
): ActiveConnection {
  return { resolve: () => Promise.resolve(credential) }
}
