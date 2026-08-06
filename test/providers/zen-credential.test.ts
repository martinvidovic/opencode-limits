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

  it('rejects custom origins', async () => {
    const customOrigin = createZenCredentialReader({
      readActiveAccount: () =>
        Promise.resolve({
          email: 'account@example.test',
          url: 'https://custom-console.example.test',
          accessToken: 'credential-canary',
          organizationId: 'organization-canary',
        }),
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
  })

  it('refreshes an expired active Console session and persists its tokens', async () => {
    const persisted: unknown[] = []
    const reader = createZenCredentialReader({
      databasePath: '/database-canary',
      readActiveAccount: () =>
        Promise.resolve({
          id: 'account-canary',
          email: 'account@example.test',
          url: 'https://console.opencode.ai',
          accessToken: 'stale-access-canary',
          refreshToken: 'refresh-canary',
          tokenExpiry: 100,
          organizationId: 'organization-canary',
        }),
      fetch: (input, init) => {
        expect(String(input)).toBe(
          'https://console.opencode.ai/auth/device/token'
        )
        expect(init).toMatchObject({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: 'refresh-canary',
            client_id: 'opencode-cli',
          }),
        })
        return Promise.resolve(
          Response.json({
            access_token: 'fresh-access-canary',
            refresh_token: 'fresh-refresh-canary',
            expires_in: 3_600,
          })
        )
      },
      persistRefreshedToken: (path, accountId, token) => {
        persisted.push(path, accountId, token)
        return Promise.resolve()
      },
      now: () => 1_000,
    })

    await expect(
      reader.read({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'success',
      credential: {
        accessToken: 'fresh-access-canary',
        organizationId: 'organization-canary',
        account: { identity: 'account@example.test' },
      },
    })
    expect(persisted).toEqual([
      '/database-canary',
      'account-canary',
      {
        accessToken: 'fresh-access-canary',
        refreshToken: 'fresh-refresh-canary',
        tokenExpiry: 3_601_000,
      },
    ])
  })
})
