import { describe, expect, it } from 'vitest'

import { createLoadLimits } from '../src/core/load-limits.js'
import type {
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
  it('loads matching registrations concurrently in stable registry order', async () => {
    const started: string[] = []
    const releases = new Map<string, () => void>()
    const registrations: readonly RegisteredProvider[] = [
      createRegistration(
        'codex',
        ['openai'],
        started,
        releases,
        successfulResult
      ),
      createRegistration(
        'zen',
        ['opencode'],
        started,
        releases,
        successfulResult
      ),
    ]
    const loadLimits = createLoadLimits({
      discovery: {
        list: () => Promise.resolve([{ id: 'openai' }, { id: 'opencode' }]),
      },
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

  it('omits disconnected registrations and isolates matching unexpected failures', async () => {
    const loadLimits = createLoadLimits({
      discovery: {
        list: () => Promise.resolve([{ id: 'openai' }, { id: 'opencode' }]),
      },
      registrations: [
        {
          id: 'codex',
          providerIds: ['openai'],
          load: () => Promise.resolve(successfulResult),
        },
        {
          id: 'zen',
          providerIds: ['opencode'],
          load: () => Promise.reject(new Error('unreachable')),
        },
      ],
    })

    await expect(
      loadLimits({ signal: new AbortController().signal })
    ).resolves.toEqual({
      providers: [
        successfulResult,
        {
          status: 'failure',
          provider: { id: 'zen', name: 'zen' },
          failure: { code: 'unavailable' },
        },
      ],
    })
  })
})

function createRegistration(
  id: string,
  providerIds: readonly string[],
  started: string[],
  releases: Map<string, () => void>,
  result: ProviderLoadResult
): RegisteredProvider {
  return {
    id,
    providerIds,
    load: () =>
      new Promise((resolve) => {
        started.push(id)
        releases.set(id, () => resolve(result))
      }),
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  while (!predicate()) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
