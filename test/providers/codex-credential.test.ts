import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { createCodexCredentialReader } from '../../src/providers/codex/credential.js'

describe('Codex credential reader', () => {
  it('uses the environment-selected OpenCode auth content and exposes only the validated credential', async () => {
    const reader = createCodexCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'openai': {
            type: 'oauth',
            access: tokenWithClaims(),
            accountId: 'account-canary',
            expires: 2_000_000_000_000,
            refresh: 'refresh-canary',
          },
          'github-copilot': { access: 'other-provider-canary' },
        }),
      },
      readFile: (() =>
        Promise.reject(
          new Error('environment content should win')
        )) as typeof readFile,
      now: () => 1_000_000_000_000,
    })

    await expect(
      reader.read({ signal: new AbortController().signal })
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

  it('returns only bounded failures for wrong auth types and stale tokens', async () => {
    const unsupported = createCodexCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({ openai: { type: 'api' } }),
      },
    })
    const stale = createCodexCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          openai: { type: 'oauth', access: 'secret-canary', expires: 100 },
        }),
      },
      now: () => 100,
    })

    await expect(
      unsupported.read({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'unsupported-auth' },
    })
    await expect(
      stale.read({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    })
  })
})

function tokenWithClaims(): string {
  const payload = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/profile': { email: 'account@example.test' },
      'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' },
    })
  ).toString('base64url')
  return `header.${payload}.signature`
}
