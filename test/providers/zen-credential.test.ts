import { describe, expect, it } from 'vitest'

import { createProviderRegistration } from '../../src/core/register-provider.js'
import { zenIdentity } from '../../src/providers/zen/adapter.js'
import { createZenCredentialReader } from '../../src/providers/zen/credential.js'

describe('OpenCode Zen credential reader', () => {
  it('returns only the active official Console account and organization', async () => {
    const reader = createZenCredentialReader({
      databasePath: '/database-canary',
      readActiveAccount: (path) => {
        expect(path).toBe('/database-canary')
        return Promise.resolve({
          email: 'account@example.test',
          url: 'https://console.opencode.ai',
          accessToken: 'credential-canary',
          tokenExpiry: 2_000_000_000_000,
          organizationId: 'organization-canary',
        })
      },
      now: () => 1_000_000_000_000,
    })

    await expect(
      reader.read({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'success',
      credential: {
        accessToken: 'credential-canary',
        organizationId: 'organization-canary',
        account: { identity: 'account@example.test' },
      },
    })
  })

  it('rejects custom origins and stale tokens without attempting refresh', async () => {
    const customOrigin = createZenCredentialReader({
      readActiveAccount: () =>
        Promise.resolve({
          email: 'account@example.test',
          url: 'https://custom-console.example.test',
          accessToken: 'credential-canary',
          organizationId: 'organization-canary',
        }),
    })
    const stale = createZenCredentialReader({
      readActiveAccount: () =>
        Promise.resolve({
          email: 'account@example.test',
          url: 'https://console.opencode.ai',
          accessToken: 'credential-canary',
          tokenExpiry: 100,
          organizationId: 'organization-canary',
        }),
      now: () => 100,
    })
    let isAdapterCalled = false
    const registration = createProviderRegistration({
      identity: zenIdentity,
      providerIds: ['opencode'],
      reader: customOrigin,
      adapter: {
        load: () => {
          isAdapterCalled = true
          return Promise.reject(
            new Error('adapter should not receive a credential')
          )
        },
      },
      requester: {
        requestJson: () =>
          Promise.reject(new Error('requester should not receive credentials')),
      },
    })

    await expect(
      registration.load({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'failure',
      provider: zenIdentity,
      failure: { code: 'unavailable' },
    })
    expect(isAdapterCalled).toBe(false)
    await expect(
      stale.read({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    })
  })
})
