import { describe, expect, it } from 'vitest'

import type { SafeRequester } from '../../src/core/model.js'
import { createCopilotAdapter } from '../../src/providers/copilot/adapter.js'

const credential = {
  accessToken: 'credential-canary',
  account: { identity: 'octocat' },
}

describe('GitHub Copilot Provider Adapter', () => {
  it('normalizes the plan, premium quota, and request balance through one safe request', async () => {
    let request: Parameters<SafeRequester['requestJson']>[0] | undefined
    const requester: SafeRequester = {
      requestJson: (input) => {
        request = input
        return Promise.resolve({
          status: 'response',
          statusCode: 200,
          json: usageFixture(),
        })
      },
    }

    await expect(
      createCopilotAdapter().load({
        credential,
        requester,
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'success',
      snapshot: {
        provider: { id: 'copilot', name: 'GitHub Copilot' },
        account: {
          identity: 'octocat',
          planOrOrganization: 'Copilot pro',
        },
        meters: [
          {
            kind: 'bounded-amount',
            label: 'Premium requests',
            used: 75,
            total: 300,
            unit: 'requests',
            resetAt: '2026-08-01T00:00:00.000Z',
          },
          {
            kind: 'remaining-balance',
            label: 'Chat requests',
            remaining: 42,
            unit: 'requests',
            resetAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        periods: [],
      },
    })
    expect(request).toEqual({
      path: '/copilot_internal/user',
      headers: {
        'Authorization': 'Bearer credential-canary',
        'User-Agent': 'opencode-limits',
      },
      signal: expect.any(AbortSignal),
    })
  })

  it('maps malformed payloads and provider statuses to bounded failures', async () => {
    const adapter = createCopilotAdapter()

    await expect(
      adapter.load({
        credential,
        requester: response({ copilot_plan: 'pro' }),
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      status: 'failure',
      failure: { code: 'invalid-response' },
    })
    await expect(
      adapter.load({
        credential,
        requester: response({ ignored: 'provider-text-canary' }, 401),
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'failure',
      provider: { id: 'copilot', name: 'GitHub Copilot' },
      account: credential.account,
      failure: { code: 'reauthentication-required' },
    })
  })
})

function response(json: unknown, statusCode = 200): SafeRequester {
  return {
    requestJson: () =>
      Promise.resolve({ status: 'response', statusCode, json }),
  }
}

function usageFixture() {
  return {
    copilot_plan: 'pro',
    quota_reset_date: '2026-08-01T00:00:00.000Z',
    monthly_quotas: {
      premium_interactions: { entitlement: 300, remaining: 225 },
    },
    limited_user_quotas: {
      chat: { remaining: 42, reset_date: '2026-08-01T00:00:00.000Z' },
    },
  }
}
