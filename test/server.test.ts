import { describe, expect, it } from 'vitest'

import { createCodexRegistration } from '../src/providers/codex/registration.js'
import { createZenRegistration } from '../src/providers/zen/registration.js'
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

  it('loads the active Console connection into a Zen Usage Snapshot for its selected organization', async () => {
    const host = createHost({
      connections: {
        openai: {
          info: credentialInfo('cred_openai'),
          resolveError: new Error('openai refresh failed'),
        },
        opencode: {
          info: credentialInfo('cred_console'),
          credential: {
            type: 'oauth',
            methodID: 'device',
            access: 'console-access-canary',
            refresh: 'console-refresh-canary',
            expires: Date.now() + 3_600_000,
            metadata: {
              server: 'https://opencode.ai/console',
              accountID: 'account-canary',
              email: 'account@example.test',
              orgID: 'org_selected',
              orgName: 'Selected Org',
            },
          },
        },
      },
    })
    const requests: { url: string; headers: Headers }[] = []
    const plugin = createServerPlugin({
      registrations: [
        createCodexRegistration({
          fetch: () => Promise.reject(new Error('must not request')),
        }),
        createZenRegistration({
          fetch: (url, init) => {
            const request = {
              url: String(url),
              headers: new Headers(init?.headers),
            }
            requests.push(request)
            if (request.url.endsWith('/api/user')) {
              return Promise.resolve(Response.json({ id: 'user-canary' }))
            }
            if (request.url.endsWith('/api/orgs')) {
              return Promise.resolve(
                Response.json([
                  { id: 'org_other', name: 'Other Org' },
                  { id: 'org_selected', name: 'Selected Org' },
                ])
              )
            }
            return Promise.resolve(
              Response.json({
                totalRequests: 2,
                totalInputTokens: 10,
                totalCostMicroCents: 250_000_000,
              })
            )
          },
        }),
      ],
    })

    await plugin.setup(host.context as never)
    const output = await host.load()

    expect(host.resolved).toEqual(['cred_openai', 'cred_console'])
    expect(
      requests.map(({ url }) => new URL(url).origin + new URL(url).pathname)
    ).toEqual([
      'https://opencode.ai/console/api/user',
      'https://opencode.ai/console/api/orgs',
      'https://opencode.ai/console/api/usage/summary',
      'https://opencode.ai/console/api/usage/summary',
    ])
    expect(requests.map(({ headers }) => headers.get('x-org-id'))).toEqual([
      'org_selected',
      'org_selected',
      'org_selected',
      'org_selected',
    ])
    expect(output).toMatchObject({
      status: 'loaded',
      view: {
        providers: [
          {
            status: 'failure',
            provider: { id: 'codex' },
            failure: { code: 'reauthentication-required' },
          },
          {
            status: 'success',
            snapshot: {
              provider: { id: 'opencode-zen', name: 'OpenCode Zen' },
              account: {
                identity: 'account@example.test',
                planOrOrganization: 'Selected Org',
              },
              meters: [],
              periods: [
                {
                  label: 'Today',
                  values: [
                    { label: 'Cost', value: 2.5, unit: 'USD' },
                    { label: 'Requests', value: 2, unit: 'requests' },
                    { label: 'Tokens', value: 10, unit: 'tokens' },
                  ],
                },
                { label: expect.any(String) as unknown },
              ],
            },
          },
        ],
      },
    })
    expect(JSON.stringify(output)).not.toMatch(/canary|Bearer/u)
  })

  it('follows the active Console account and organization after an account switch', async () => {
    const consoleConnection = (id: string, org: string, email: string) => ({
      info: credentialInfo(id),
      credential: {
        type: 'oauth',
        methodID: 'device',
        access: `${id}-access-canary`,
        refresh: `${id}-refresh-canary`,
        expires: Date.now() + 3_600_000,
        metadata: { email, orgID: org, orgName: org },
      },
    })
    const connections: Record<string, ReturnType<typeof consoleConnection>> = {
      opencode: consoleConnection('cred_work', 'org_work', 'work@example.test'),
    }
    const host = createHost({ connections })
    const seen: { authorization: string | null; org: string | null }[] = []
    const plugin = createServerPlugin({
      registrations: [
        createZenRegistration({
          fetch: (url, init) => {
            const headers = new Headers(init?.headers)
            seen.push({
              authorization: headers.get('authorization'),
              org: headers.get('x-org-id'),
            })
            if (String(url).endsWith('/api/user')) {
              return Promise.resolve(Response.json({ id: 'user' }))
            }
            if (String(url).endsWith('/api/orgs')) {
              return Promise.resolve(
                Response.json([
                  { id: 'org_work', name: 'Work' },
                  { id: 'org_home', name: 'Home' },
                ])
              )
            }
            return Promise.resolve(Response.json({ totalRequests: 1 }))
          },
        }),
      ],
    })

    await plugin.setup(host.context as never)
    const first = await host.load()
    connections.opencode = consoleConnection(
      'cred_home',
      'org_home',
      'home@example.test'
    )
    const second = await host.load()

    expect(host.resolved).toEqual(['cred_work', 'cred_home'])
    expect(new Set(seen.slice(0, 4).map(({ org }) => org))).toEqual(
      new Set(['org_work'])
    )
    expect(new Set(seen.slice(4).map(({ org }) => org))).toEqual(
      new Set(['org_home'])
    )
    expect(seen[4]?.authorization).toBe('Bearer cred_home-access-canary')
    expect(first).toMatchObject({
      view: {
        providers: [
          {
            snapshot: {
              account: {
                identity: 'work@example.test',
                planOrOrganization: 'Work',
              },
            },
          },
        ],
      },
    })
    expect(second).toMatchObject({
      view: {
        providers: [
          {
            snapshot: {
              account: {
                identity: 'home@example.test',
                planOrOrganization: 'Home',
              },
            },
          },
        ],
      },
    })
  })

  it('hides Display-only Account Context before it crosses the RPC boundary', async () => {
    const host = createHost({
      options: { showAccountContext: false },
      connections: {
        openai: {
          info: credentialInfo('cred_openai'),
          credential: {
            type: 'oauth',
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
