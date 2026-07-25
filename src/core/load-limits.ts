import type {
  LimitsView,
  LoadLimits,
  ProviderDiscovery,
  ProviderLoadResult,
  RegisteredProvider,
} from './model.js'

export function createLoadLimits(input: {
  readonly discovery: ProviderDiscovery
  readonly registrations: readonly RegisteredProvider[]
}): LoadLimits {
  return async ({ signal }) => {
    const connectedProviderIds = new Set(
      (await input.discovery.list()).map((provider) => provider.id)
    )
    const matchingRegistrations = input.registrations.filter((registration) =>
      registration.providerIds.some((providerId) =>
        connectedProviderIds.has(providerId)
      )
    )
    const providers = await Promise.all(
      matchingRegistrations.map(
        async (registration): Promise<ProviderLoadResult> => {
          try {
            return await registration.load({ signal })
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

    return { providers } satisfies LimitsView
  }
}
