import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { createCopilotCredentialReader } from '../../src/providers/copilot/credential.js'

describe('GitHub Copilot credential reader', () => {
  it('reads access when present, ignoring expires: 0 like /status-codex', async () => {
    const reader = createCopilotCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'github-copilot': {
            type: 'oauth',
            access: 'credential-canary',
            refresh: 'refresh-canary',
            login: 'octocat',
            expires: 0,
          },
          'openai': { access: 'other-provider-canary' },
        }),
      },
      readFile: (() =>
        Promise.reject(
          new Error('environment content should win')
        )) as typeof readFile,
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

  it('falls back to refresh when access is missing', async () => {
    const reader = createCopilotCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'github-copilot': {
            type: 'oauth',
            refresh: 'refresh-canary',
            expires: 0,
          },
        }),
      },
    })

    await expect(
      reader.read({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'success',
      credential: { accessToken: 'refresh-canary' },
    })
  })

  it('maps unsupported auth and missing tokens to bounded failures', async () => {
    const unsupported = createCopilotCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'github-copilot': { type: 'api' },
        }),
      },
    })
    const missing = createCopilotCredentialReader({
      environment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'github-copilot': {
            type: 'oauth',
            expires: 0,
          },
        }),
      },
    })

    await expect(
      unsupported.read({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'unsupported-auth' },
    })
    await expect(
      missing.read({ signal: new AbortController().signal })
    ).resolves.toEqual({
      status: 'failure',
      failure: { code: 'reauthentication-required' },
    })
  })
})
