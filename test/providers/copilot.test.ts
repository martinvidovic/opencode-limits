import { describe, expect, it } from 'vitest'

import type { SafeRequester } from '../../src/core/model.js'
import { createCopilotAdapter } from '../../src/providers/copilot/adapter.js'

const credential = {
  accessToken: 'credential-canary',
  account: { identity: 'octocat' },
}

describe('GitHub Copilot Provider Adapter', () => {
  it('normalizes quota_snapshots like /status-codex through one safe request', async () => {
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
        credential: { accessToken: 'credential-canary' },
        requester,
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'success',
      snapshot: {
        provider: { id: 'copilot', name: 'Copilot' },
        account: {
          identity: 'martinvidovic',
          planOrOrganization: 'GitHub Copilot Business',
        },
        meters: [
          {
            kind: 'fraction-used',
            label: 'Premium',
            used: 0,
            total: 100,
          },
          {
            kind: 'bounded-amount',
            label: 'Requests',
            used: 0,
            total: 5000,
            unit: 'requests',
            resetAt: '2026-09-01T00:00:00.000Z',
            resetDateOnly: true,
          },
        ],
        periods: [],
      },
    })
    expect(request).toEqual({
      path: '/copilot_internal/user',
      headers: {
        'Authorization': 'Bearer credential-canary',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
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
      provider: { id: 'copilot', name: 'Copilot' },
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
    login: 'martinvidovic',
    copilot_plan: 'business',
    access_type_sku: 'copilot_for_business_seat_quota',
    quota_reset_date: '2026-09-01',
    quota_reset_date_utc: '2026-09-01T00:00:00.000Z',
    quota_snapshots: {
      premium_interactions: {
        percent_remaining: 100,
        quota_remaining: 5000,
        remaining: 5000,
        entitlement: 5000,
        unlimited: false,
      },
    },
  }
}
