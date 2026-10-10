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
        let json: unknown = usageFixture(1.84, 42, 1_200_000)
        if (input.path === '/api/user') json = { id: 'user-canary' }
        if (input.path === '/api/orgs') {
          json = [
            { id: 'other-organization', name: 'Other' },
            { id: 'organization-canary', name: 'Acme Engineering' },
          ]
        }
        if (input.path.includes('/api/usage/cost-by-day?')) {
          json = [
            dailyUsage('2026-09-30', 12_000_000, 10, 200_000),
            dailyUsage('2026-10-01', 105_000_000, 63, 1_970_911),
          ]
        }
        if (input.path.includes('since=')) {
          json = {
            totalRequests: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCostMicroCents: 0,
          }
        }
        return Promise.resolve({ status: 'response', statusCode: 200, json })
      },
    }

    await expect(
      createZenAdapter({
        now: () => new Date('2026-10-05T08:00:00.000Z'),
      }).load({
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
          period('October', 1.05, 63, 1_970_911),
        ],
      },
    })
    expect(requests.map((request) => request.path)).toEqual([
      '/api/user',
      '/api/orgs',
      '/api/usage/summary?userId=user-canary&range=24h',
      '/api/usage/cost-by-day?userId=user-canary&range=30d&bucket=day',
    ])
    expect(requests).toEqual(
      requests.map((request) => ({
        ...request,
        headers: {
          'Authorization': 'Bearer credential-canary',
          'User-Agent': 'opencode-limits',
          'x-org-id': 'organization-canary',
        },
        signal: expect.any(AbortSignal),
      }))
    )
  })

  it('converts micro-cents to dollars', async () => {
    const requester: SafeRequester = {
      requestJson: (input) => {
        let json: unknown = { totalCostMicroCents: '41000000' }
        if (input.path === '/api/user') json = { id: 'user-canary' }
        if (input.path === '/api/orgs') {
          json = [{ id: 'organization-canary', name: 'Acme Engineering' }]
        }
        if (input.path.includes('/api/usage/cost-by-day?')) {
          json = [dailyUsage('2026-08-01', 287_000_000, 0, 0)]
        }
        return Promise.resolve({ status: 'response', statusCode: 200, json })
      },
    }

    const result = await createZenAdapter({
      now: () => new Date('2026-08-06T08:00:00.000Z'),
    }).load({
      credential,
      requester,
      signal: new AbortController().signal,
    })

    expect(result).toEqual({
      status: 'success',
      snapshot: {
        provider: { id: 'opencode-zen', name: 'OpenCode Zen' },
        account: {
          identity: 'account@example.test',
          planOrOrganization: 'Acme Engineering',
        },
        meters: [],
        periods: [period('Today', 0.41, 0, 0), period('August', 2.87, 0, 0)],
      },
    })
    expect(renderLimits({ providers: [result] })).toBe(
      'OPENCODE ZEN\nAccount:   account@example.test (Acme Engineering)\n\nToday:     | $0.41 | 0 requests | 0 tokens\nAugust:    | $2.87 | 0 requests | 0 tokens'
    )
  })

  it('maps malformed payloads and provider statuses to bounded failures', async () => {
    const adapter = createZenAdapter()

    await expect(
      adapter.load({
        credential,
        requester: response(
          { id: 'user-canary' },
          [{ id: 'organization-canary', name: 'Acme Engineering' }],
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
        requester: response({ ignored: 'provider-text-canary' }, [], {}, 401),
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'failure',
      provider: { id: 'opencode-zen', name: 'OpenCode Zen' },
      account: credential.account,
      failure: { code: 'reauthentication-required' },
    })
  })

  it('uses all daily history on UTC day 31 and includes day one only for this month', async () => {
    const rows = [
      dailyUsage('2026-09-30', 900_000_000, 90, 900),
      dailyUsage('2026-10-01', 100_000_000, 2, 20),
      dailyUsage('2026-10-31', 200_000_000, 3, 30),
    ]
    const result = await createZenAdapter({
      now: () => new Date('2026-10-31T23:59:00.000Z'),
    }).load({
      credential,
      requester: dailyRequester(rows, {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostMicroCents: 0,
      }),
      signal: new AbortController().signal,
    })

    expect(result).toMatchObject({
      status: 'success',
      snapshot: {
        periods: [period('Today', 0, 0, 0), period('October', 3, 5, 50)],
      },
    })
  })

  it('rejects malformed daily usage rows', async () => {
    const requester = dailyRequester([
      {
        date: '2026-10-01',
        totalRequests: -1,
        totalTokens: 1,
        totalCostMicroCents: 1,
      },
    ])
    await expect(
      createZenAdapter({
        now: () => new Date('2026-10-05T08:00:00.000Z'),
      }).load({
        credential,
        requester,
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      status: 'failure',
      failure: { code: 'invalid-response' },
    })
  })

  it('rejects blank daily numeric values', async () => {
    const requester = dailyRequester([
      {
        date: '2026-10-01',
        totalRequests: ' ',
        totalTokens: 1,
        totalCostMicroCents: 1,
      },
    ])

    await expect(
      createZenAdapter({
        now: () => new Date('2026-10-05T08:00:00.000Z'),
      }).load({
        credential,
        requester,
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      status: 'failure',
      failure: { code: 'invalid-response' },
    })
  })

  it('accepts an empty daily usage array as zero', async () => {
    const result = await createZenAdapter({
      now: () => new Date('2026-10-05T08:00:00.000Z'),
    }).load({
      credential,
      requester: dailyRequester([]),
      signal: new AbortController().signal,
    })

    expect(result).toMatchObject({
      status: 'success',
      snapshot: {
        periods: [period('Today', 0.01, 1, 200), period('October', 0, 0, 0)],
      },
    })
  })

  it('rejects a non-array daily usage response', async () => {
    const requester: SafeRequester = {
      requestJson: (input) => {
        let json: unknown = usageFixture(0.01, 1, 200)
        if (input.path === '/api/user') json = { id: 'user-canary' }
        if (input.path === '/api/orgs') {
          json = [{ id: 'organization-canary', name: 'Acme Engineering' }]
        }
        if (input.path.includes('/api/usage/cost-by-day?')) json = { rows: [] }
        return Promise.resolve({ status: 'response', statusCode: 200, json })
      },
    }

    await expect(
      createZenAdapter({
        now: () => new Date('2026-10-05T08:00:00.000Z'),
      }).load({
        credential,
        requester,
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      status: 'failure',
      failure: { code: 'invalid-response' },
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
      'OPENCODE ZEN\nAccount:   account@example.test (Acme Engineering)\n\nToday:     | $1.84  | 42 requests   | 1.2M tokens\n30 days:   | $38.20 | 1.4k requests | 31.8M tokens'
    )
  })
})

function response(
  user: unknown,
  organization: unknown,
  usage: unknown,
  statusCode = 200
): SafeRequester {
  const values = [user, organization, usage, usage]
  let index = 0
  return {
    requestJson: () => {
      const json = values[index]
      index += 1
      return Promise.resolve({ status: 'response', statusCode, json })
    },
  }
}

function dailyRequester(
  daily: unknown,
  today: unknown = usageFixture(0.01, 1, 200)
): SafeRequester {
  return {
    requestJson: ({ path }) => {
      let json: unknown = today
      if (path === '/api/user') json = { id: 'user-canary' }
      if (path === '/api/orgs') {
        json = [{ id: 'organization-canary', name: 'Acme Engineering' }]
      }
      if (path.includes('/api/usage/cost-by-day?')) json = daily
      return Promise.resolve({ status: 'response', statusCode: 200, json })
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

function usageFixture(cost: number, requests: number, tokens: number) {
  return {
    totalRequests: String(requests),
    totalInputTokens: String(tokens - 140),
    totalOutputTokens: '100',
    totalCacheReadTokens: '10',
    totalCacheWrite5mTokens: '20',
    totalCacheWrite1hTokens: '10',
    totalCostMicroCents: String(cost * 100_000_000),
  }
}

function dailyUsage(
  date: string,
  totalCostMicroCents: number,
  totalRequests: number,
  totalTokens: number
) {
  return { date, totalCostMicroCents, totalRequests, totalTokens }
}
