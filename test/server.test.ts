import { describe, expect, it } from 'vitest'

import { createCodexRegistration } from '../src/providers/codex/registration.js'
import { limitsRpc } from '../src/rpc.js'
import { createServerPlugin } from '../src/server.js'

interface IConnectionInfo {
  readonly type: 'credential'
  readonly id: string
  readonly label: string
  readonly method: 'oauth' | 'key'
}

type LoadHandler = (
  input: unknown,
  context: { readonly signal: AbortSignal }
) => Promise<unknown>

const accessToken = tokenWithClaims()

describe('server plugin', () => {
  it('registers the limits RPC and loads the active OpenAI connection into a Codex Usage Snapshot', async () => {
    const host = createHost({
      connections: {
        openai: {
          info: credentialInfo('cred_openai'),
          credential: {
            type: 'oauth',
            methodID: 'chatgpt-browser',
            access: accessToken,
            refresh: 'refresh-canary',
            expires: Date.now() + 3_600_000,
            metadata: { accountID: 'account-canary' },
          },
        },
      },
    })
    const requests: { url: string; headers: Headers }[] = []
    const plugin = createServerPlugin({
      registrations: [
        createCodexRegistration({
          fetch: (url, init) => {
            requests.push({
              url: String(url),
              headers: new Headers(init?.headers),
            })
            return Promise.resolve(Response.json(codexUsage()))
          },
        }),
      ],
    })

    await plugin.setup(host.context as never)
    const output = await host.load()

    expect(plugin.id).toBe('opencode-limits')
    expect(host.registered).toBe(limitsRpc)
    expect(host.resolved).toEqual(['cred_openai'])
    expect(requests.map(({ url }) => url)).toEqual([
      'https://chatgpt.com/backend-api/wham/usage',
    ])
    expect(requests[0]?.headers.get('chatgpt-account-id')).toBe(
      'account-canary'
    )
    expect(output).toEqual({
      status: 'loaded',
      view: {
        providers: [
          {
            status: 'success',
            snapshot: {
              provider: { id: 'codex', name: 'Codex' },
              account: {
                identity: 'account@example.test',
                planOrOrganization: 'ChatGPT Plus',
              },
              meters: [
                {
                  kind: 'fraction-used',
                  label: '5h limit',
                  used: 25,
                  total: 100,
                  resetAt: '2030-01-01T00:00:00.000Z',
                },
                {
                  kind: 'unavailable',
                  label: 'Weekly',
                  resetUnknown: true,
                },
              ],
              periods: [],
            },
          },
        ],
      },
    })
    expect(JSON.stringify(output)).not.toMatch(
      /canary|signature|refresh|Bearer/u
    )
  })

  it('refuses a non-ChatGPT OAuth method before any Codex request', async () => {
    const host = createHost({
      connections: {
        openai: {
          info: credentialInfo('cred_openai'),
          credential: {
            type: 'oauth',
            methodID: 'device',
            access: 'foreign-access-canary',
            refresh: 'foreign-refresh-canary',
            expires: Date.now() + 3_600_000,
          },
        },
      },
    })
    let requests = 0
    const plugin = createServerPlugin({
      registrations: [
        createCodexRegistration({
          fetch: () => {
            requests += 1
            return Promise.reject(new Error('must not request'))
          },
        }),
      ],
    })

    await plugin.setup(host.context as never)
    const output = await host.load()

    expect(requests).toBe(0)
    expect(output).toEqual({
      status: 'loaded',
      view: {
        providers: [
          {
            status: 'failure',
            provider: { id: 'codex', name: 'Codex' },
            failure: { code: 'unsupported-auth' },
          },
        ],
      },
    })
    expect(JSON.stringify(output)).not.toContain('canary')
  })

  it('hides Display-only Account Context before it crosses the RPC boundary', async () => {
    const host = createHost({
      options: { showAccountContext: false },
      connections: {
        openai: {
          info: credentialInfo('cred_openai'),
          credential: {
            type: 'oauth',
            methodID: 'chatgpt-browser',
            access: accessToken,
            refresh: 'refresh-canary',
            expires: Date.now() + 3_600_000,
          },
        },
      },
    })
    const plugin = createServerPlugin({
      registrations: [
        createCodexRegistration({
          fetch: () => Promise.resolve(new Response('{}', { status: 401 })),
        }),
        {
          id: 'fixture',
          integrationId: 'openai',
          load: () =>
            Promise.resolve({
              status: 'success',
              snapshot: {
                provider: { id: 'fixture', name: 'Fixture' },
                account: { identity: 'fixture@example.test' },
                meters: [],
                periods: [],
              },
            }),
        },
      ],
    })

    await plugin.setup(host.context as never)
    const output = await host.load()

    expect(output).toEqual({
      status: 'loaded',
      view: {
        providers: [
          {
            status: 'failure',
            provider: { id: 'codex', name: 'Codex' },
            failure: { code: 'reauthentication-required' },
          },
          {
            status: 'success',
            snapshot: {
              provider: { id: 'fixture', name: 'Fixture' },
              meters: [],
              periods: [],
            },
          },
        ],
      },
    })
    expect(JSON.stringify(output)).not.toContain('example.test')
  })

  it('omits disconnected integrations and returns bounded failures for unresolvable connections', async () => {
    const disconnected = createHost({ connections: {} })
    const failing = createHost({
      connections: {
        openai: {
          info: credentialInfo('cred_openai'),
          resolveError: new Error('refresh failed for token-canary'),
        },
      },
    })
    const plugin = createServerPlugin({
      registrations: [
        createCodexRegistration({
          fetch: () => Promise.reject(new Error('must not request')),
        }),
      ],
    })

    await plugin.setup(disconnected.context as never)
    await plugin.setup(failing.context as never)

    await expect(disconnected.load()).resolves.toEqual({
      status: 'loaded',
      view: { providers: [] },
    })
    const failure = await failing.load()
    expect(failure).toEqual({
      status: 'loaded',
      view: {
        providers: [
          {
            status: 'failure',
            provider: { id: 'codex', name: 'Codex' },
            failure: { code: 'reauthentication-required' },
          },
        ],
      },
    })
    expect(JSON.stringify(failure)).not.toContain('canary')
  })

  it('reports invalid options without discovering connections', async () => {
    const host = createHost({
      options: { showAccountContext: 'false' },
      connections: {},
    })
    const plugin = createServerPlugin({ registrations: [] })

    await plugin.setup(host.context as never)

    await expect(host.load()).resolves.toEqual({
      status: 'invalid-configuration',
    })
    expect(host.activeCalls).toEqual([])
  })

  it('passes RPC cancellation to provider requests', async () => {
    const host = createHost({
      connections: {
        openai: {
          info: credentialInfo('cred_openai'),
          credential: {
            type: 'oauth',
            methodID: 'chatgpt-browser',
            access: accessToken,
            refresh: 'refresh-canary',
            expires: Date.now() + 3_600_000,
          },
        },
      },
    })
    const controller = new AbortController()
    const plugin = createServerPlugin({
      registrations: [
        createCodexRegistration({
          fetch: (_url, init) =>
            new Promise((_resolve, reject) => {
              if (init?.signal?.aborted === true) reject(new Error('aborted'))
              init?.signal?.addEventListener('abort', () =>
                reject(new Error('aborted'))
              )
            }),
        }),
      ],
    })

    await plugin.setup(host.context as never)
    const completion = host.load(controller.signal)
    controller.abort()

    await expect(completion).resolves.toMatchObject({
      view: {
        providers: [{ status: 'failure', failure: { code: 'network' } }],
      },
    })
  })
})

function createHost(input: {
  readonly options?: Readonly<Record<string, unknown>>
  readonly connections: Readonly<
    Record<
      string,
      {
        readonly info: IConnectionInfo
        readonly credential?: unknown
        readonly resolveError?: Error
      }
    >
  >
}) {
  const state = {
    registered: undefined as unknown,
    handler: undefined as LoadHandler | undefined,
    activeCalls: [] as string[],
    resolved: [] as string[],
  }
  const context = {
    options: input.options ?? {},
    integration: {
      connection: {
        active: (integrationId: string) => {
          state.activeCalls.push(integrationId)
          return Promise.resolve(input.connections[integrationId]?.info)
        },
        resolve: (connection: IConnectionInfo) => {
          state.resolved.push(connection.id)
          const entry = Object.values(input.connections).find(
            ({ info }) => info.id === connection.id
          )
          if (entry?.resolveError !== undefined) {
            return Promise.reject(entry.resolveError)
          }
          return Promise.resolve(entry?.credential)
        },
      },
    },
    rpc: {
      register: (definition: unknown, handlers: { load: LoadHandler }) => {
        state.registered = definition
        state.handler = handlers.load
        return Promise.resolve({ dispose: () => Promise.resolve() })
      },
    },
  }

  return {
    context,
    get registered() {
      return state.registered
    },
    get activeCalls() {
      return state.activeCalls
    },
    get resolved() {
      return state.resolved
    },
    load: (signal = new AbortController().signal) => {
      if (state.handler === undefined) throw new Error('RPC not registered')
      return state.handler({}, { signal })
    },
  }
}

function credentialInfo(id: string): IConnectionInfo {
  return { type: 'credential', id, label: 'Work', method: 'oauth' }
}

function codexUsage() {
  return {
    rate_limit: {
      primary_window: {
        limit_window_seconds: 18_000,
        used_percent: 25,
        reset_at: 1_893_456_000,
      },
    },
  }
}

function tokenWithClaims(): string {
  const payload = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/profile': { email: 'account@example.test' },
      'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' },
    })
  ).toString('base64url')
  return `header.${payload}.signature`
}
