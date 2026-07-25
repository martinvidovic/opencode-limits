import { describe, expect, it } from 'vitest'

import type { SafeRequester } from '../../src/core/model.js'
import { renderLimits } from '../../src/presentation/render-limits.js'
import { createZenAdapter } from '../../src/providers/zen/adapter.js'

const credential = {
  accessToken: 'credential-canary',
  organizationId: 'organization-canary',
  account: { identity: 'account@example.test' },
}

describe('OpenCode Zen Provider Adapter', () => {
  it('normalizes active account organization and usage periods through safe requests', async () => {
    const requests: Parameters<SafeRequester['requestJson']>[0][] = []
    const requester: SafeRequester = {
      requestJson: (input) => {
        requests.push(input)
        let json: unknown = usageFixture()
        if (input.path === '/api/user') json = { id: 'user-canary' }
        if (input.path === '/api/orgs/organization-canary') {
          json = { name: 'Acme Engineering' }
        }
        return Promise.resolve({ status: 'response', statusCode: 200, json })
      },
    }

    await expect(
      createZenAdapter().load({
        credential,
        requester,
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'success',
      snapshot: {
        provider: { id: 'opencode-zen', name: 'OpenCode Zen' },
        account: {
          identity: 'account@example.test',
          planOrOrganization: 'Acme Engineering',
        },
        meters: [],
        periods: [
          period('Today', 1.84, 42, 1_200_000),
          period('30 days', 38.2, 1_400, 31_800_000),
        ],
      },
    })
    expect(requests.map((request) => request.path)).toEqual([
      '/api/user',
      '/api/orgs/organization-canary',
      '/api/usage/summary?organization_id=organization-canary',
    ])
    expect(requests).toEqual(
      requests.map((request) => ({
        ...request,
        headers: {
          'Authorization': 'Bearer credential-canary',
          'User-Agent': 'opencode-limits',
        },
        signal: expect.any(AbortSignal),
      }))
    )
  })

  it('maps malformed payloads and provider statuses to bounded failures', async () => {
    const adapter = createZenAdapter()

    await expect(
      adapter.load({
        credential,
        requester: response(
          { id: 'user-canary' },
          { name: 'Acme Engineering' },
          {}
        ),
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      status: 'failure',
      failure: { code: 'invalid-response' },
    })
    await expect(
      adapter.load({
        credential,
        requester: response({ ignored: 'provider-text-canary' }, {}, {}, 401),
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'failure',
      provider: { id: 'opencode-zen', name: 'OpenCode Zen' },
      account: credential.account,
      failure: { code: 'reauthentication-required' },
    })
  })

  it('renders the normalized Today and 30 days summaries', () => {
    expect(
      renderLimits({
        providers: [
          {
            status: 'success',
            snapshot: {
              provider: { id: 'opencode-zen', name: 'OpenCode Zen' },
              account: {
                identity: 'account@example.test',
                planOrOrganization: 'Acme Engineering',
              },
              meters: [],
              periods: [
                period('Today', 1.84, 42, 1_200_000),
                period('30 days', 38.2, 1_400, 31_800_000),
              ],
            },
          },
        ],
      })
    ).toBe(
      'OPENCODE ZEN\naccount@example.test (Acme Engineering)\n\nToday            Cost: 1.84 USD | Requests: 42 requests | Tokens: 1200000 tokens\n30 days          Cost: 38.2 USD | Requests: 1400 requests | Tokens: 31800000 tokens'
    )
  })
})

function response(
  user: unknown,
  organization: unknown,
  usage: unknown,
  statusCode = 200
): SafeRequester {
  const values = [user, organization, usage]
  let index = 0
  return {
    requestJson: () => {
      const json = values[index]
      index += 1
      return Promise.resolve({ status: 'response', statusCode, json })
    },
  }
}

function period(label: string, cost: number, requests: number, tokens: number) {
  return {
    label,
    values: [
      { label: 'Cost', value: cost, unit: 'USD' },
      { label: 'Requests', value: requests, unit: 'requests' },
      { label: 'Tokens', value: tokens, unit: 'tokens' },
    ],
  }
}

function usageFixture() {
  return {
    today: { cost: 1.84, requests: 42, tokens: 1_200_000 },
    thirty_days: { cost: 38.2, requests: 1_400, tokens: 31_800_000 },
  }
}
