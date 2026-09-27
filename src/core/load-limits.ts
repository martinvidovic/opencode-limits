import type {
  IntegrationConnections,
  LimitsView,
  LoadLimits,
  ProviderLoadResult,
  RegisteredProvider,
} from './model.js'

export function createLoadLimits(input: {
  readonly connections: IntegrationConnections
  readonly registrations: readonly RegisteredProvider[]
}): LoadLimits {
  return async ({ signal }) => {
    const results = await Promise.all(
      input.registrations.map(
        async (registration): Promise<ProviderLoadResult | undefined> => {
          try {
            const connection = await input.connections.active(
              registration.integrationId
            )
            if (connection === undefined) return undefined
            return await registration.load({ connection, signal })
          } catch {
            return {
              status: 'failure',
              provider: { id: registration.id, name: registration.id },
              failure: { code: 'unavailable' },
            }
          }
        }
      )
    )
    const providers = results.filter(
      (result): result is ProviderLoadResult => result !== undefined
    )

    return { providers } satisfies LimitsView
  }
}
