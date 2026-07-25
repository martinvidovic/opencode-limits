import type { ProviderLoadResult, RegisteredProvider } from '../core/model.js'

const fixtureResult: ProviderLoadResult = {
  status: 'success',
  snapshot: {
    provider: { id: 'fixture', name: 'Fixture Provider' },
    account: {
      identity: 'fixture@example.test',
      planOrOrganization: 'Fixture plan',
    },
    meters: [
      {
        kind: 'fraction-used',
        label: 'Fixture limit',
        used: 2,
        total: 5,
        resetAt: '2026-07-25T14:30:00.000Z',
      },
    ],
    periods: [
      {
        label: 'Today',
        values: [{ label: 'Requests', value: 42, unit: 'requests' }],
      },
    ],
  },
}

export const fixtureProvider: RegisteredProvider = {
  id: 'fixture',
  providerIds: ['fixture'],
  load: () => Promise.resolve(fixtureResult),
}

export const fixtureProviderDiscovery = {
  list: () => Promise.resolve([{ id: 'fixture' }]),
}
