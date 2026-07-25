import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { createCopilotCredentialReader } from '../../src/providers/copilot/credential.js'

describe('GitHub Copilot credential reader', () => {
  it('reads only the validated GitHub Copilot OAuth record', async () => {
    const reader = createCopilotCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'github-copilot': {
            type: 'oauth',
            access: 'credential-canary',
            login: 'octocat',
            expires: 2_000_000_000_000,
          },
          'openai': { access: 'other-provider-canary' },
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
        accessToken: 'credential-canary',
        account: { identity: 'octocat' },
      },
    })
  })

  it('maps unsupported and stale auth records to bounded failures', async () => {
    const unsupported = createCopilotCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'github-copilot': { type: 'api' },
        }),
      },
    })
    const stale = createCopilotCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'github-copilot': {
            type: 'oauth',
            access: 'credential-canary',
            expires: 100,
          },
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
