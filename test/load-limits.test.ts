import { describe, expect, it } from 'vitest'

import { createLoadLimits } from '../src/core/load-limits.js'
import type {
  ActiveConnection,
  IntegrationConnections,
  ProviderLoadResult,
  RegisteredProvider,
} from '../src/core/model.js'

const successfulResult: ProviderLoadResult = {
  status: 'success',
  snapshot: {
    provider: { id: 'fixture', name: 'Fixture Provider' },
    account: {
      identity: 'fixture@example.test',
      planOrOrganization: 'Fixture plan',
    },
    meters: [],
    periods: [],
  },
}

describe('LoadLimits', () => {
  it('loads connected registrations concurrently in stable registry order', async () => {
    const started: string[] = []
    const releases = new Map<string, () => void>()
    const registrations: readonly RegisteredProvider[] = [
      createRegistration('codex', 'openai', started, releases),
      createRegistration('zen', 'opencode', started, releases),
    ]
    const loadLimits = createLoadLimits({
      connections: connectionsFor(['openai', 'opencode']),
      registrations,
    })
    const completion = loadLimits({ signal: new AbortController().signal })

    await waitFor(() => started.length === 2)
    releases.get('zen')?.()
    releases.get('codex')?.()

    await expect(completion).resolves.toEqual({
      providers: [successfulResult, successfulResult],
    })
    expect(started).toEqual(['codex', 'zen'])
  })

  it('passes the active connection of the registered integration to its load', async () => {
    const received: ActiveConnection[] = []
    const openai: ActiveConnection = {
      resolve: () => Promise.resolve(undefined),
    }
    const loadLimits = createLoadLimits({
      connections: {
        active: (integrationId) =>
          Promise.resolve(integrationId === 'openai' ? openai : undefined),
      },
      registrations: [
        {
          id: 'codex',
          integrationId: 'openai',
          load: ({ connection }) => {
            received.push(connection)
            return Promise.resolve(successfulResult)
          },
        },
      ],
    })

    await loadLimits({ signal: new AbortController().signal })

    expect(received).toEqual([openai])
  })

  it('omits disconnected registrations and isolates unexpected failures', async () => {
    const loadLimits = createLoadLimits({
      connections: {
        active: (integrationId) => {
          if (integrationId === 'github-copilot') {
            return Promise.reject(new Error('discovery-canary'))
          }
          return Promise.resolve(
            integrationId === 'unconnected' ? undefined : unresolvable()
          )
        },
      },
      registrations: [
        {
          id: 'codex',
          integrationId: 'openai',
          load: () => Promise.resolve(successfulResult),
        },
        {
          id: 'zen',
          integrationId: 'opencode',
          load: () => Promise.reject(new Error('load-canary')),
        },
        {
          id: 'copilot',
          integrationId: 'github-copilot',
          load: () => Promise.resolve(successfulResult),
        },
        {
          id: 'other',
          integrationId: 'unconnected',
          load: () => Promise.resolve(successfulResult),
        },
      ],
    })

    const view = await loadLimits({ signal: new AbortController().signal })

    expect(view).toEqual({
      providers: [
        successfulResult,
        {
          status: 'failure',
          provider: { id: 'zen', name: 'zen' },
          failure: { code: 'unavailable' },
        },
        {
          status: 'failure',
          provider: { id: 'copilot', name: 'copilot' },
          failure: { code: 'unavailable' },
        },
      ],
    })
    expect(JSON.stringify(view)).not.toContain('canary')
  })
})

function connectionsFor(
  integrationIds: readonly string[]
): IntegrationConnections {
  return {
    active: (integrationId) =>
      Promise.resolve(
        integrationIds.includes(integrationId) ? unresolvable() : undefined
      ),
  }
}

function unresolvable(): ActiveConnection {
  return { resolve: () => Promise.resolve(undefined) }
}

function createRegistration(
  id: string,
  integrationId: string,
  started: string[],
  releases: Map<string, () => void>
): RegisteredProvider {
  return {
    id,
    integrationId,
    load: () =>
      new Promise((resolve) => {
        started.push(id)
        releases.set(id, () => resolve(successfulResult))
      }),
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  while (!predicate()) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
