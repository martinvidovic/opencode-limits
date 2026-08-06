import { describe, expect, it } from 'vitest'

import type { SafeRequester } from '../../src/core/model.js'
import { createCodexAdapter } from '../../src/providers/codex/adapter.js'

const credential = {
  accessToken: 'credential-canary',
  accountId: 'account-canary',
  account: {
    identity: 'account@example.test',
    planOrOrganization: 'ChatGPT Plus',
  },
}

describe('Codex Provider Adapter', () => {
  it('normalizes both private usage windows through one safe request', async () => {
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
      createCodexAdapter().load({
        credential,
        requester,
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'success',
      snapshot: {
        provider: { id: 'codex', name: 'Codex' },
        account: credential.account,
        meters: [
          {
            kind: 'fraction-used',
            label: 'Five-hour limit',
            used: 25,
            total: 100,
            resetAt: '2026-07-25T14:50:00.000Z',
          },
          {
            kind: 'fraction-used',
            label: 'Weekly limit',
            used: 50,
            total: 100,
            resetAt: '2026-07-27T14:50:00.000Z',
          },
        ],
        periods: [],
      },
    })
    expect(request).toEqual({
      path: '/backend-api/wham/usage',
      headers: {
        'Authorization': 'Bearer credential-canary',
        'ChatGPT-Account-Id': 'account-canary',
        'User-Agent': 'codex-cli',
      },
      signal: expect.any(AbortSignal),
    })
  })

  it('accepts positional usage windows without optional duration or reset metadata', async () => {
    await expect(
      createCodexAdapter().load({
        credential,
        requester: response({
          rate_limit: {
            primary_window: { used_percent: 25 },
            secondary_window: { used_percent: 50 },
          },
        }),
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'success',
      snapshot: {
        provider: { id: 'codex', name: 'Codex' },
        account: credential.account,
        meters: [
          {
            kind: 'fraction-used',
            label: 'Five-hour limit',
            used: 25,
            total: 100,
          },
          {
            kind: 'fraction-used',
            label: 'Weekly limit',
            used: 50,
            total: 100,
          },
        ],
        periods: [],
      },
    })
  })

  it('maps malformed payloads and provider statuses to bounded failures', async () => {
    const adapter = createCodexAdapter()

    await expect(
      adapter.load({
        credential,
        requester: response({ rate_limit: { primary_window: {} } }),
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
      provider: { id: 'codex', name: 'Codex' },
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
    rate_limit: {
      primary_window: {
        used_percent: 25,
        limit_window_seconds: 18_000,
        reset_at: 1_784_991_000,
      },
      secondary_window: {
        used_percent: 50,
        limit_window_seconds: 604_800,
        reset_at: 1_785_163_800,
      },
    },
  }
}
