import type { Context } from '@opencode/plugin/promise/plugin'

import type {
  ConnectionCredential,
  IntegrationConnections,
} from '../core/model.js'

export function createOpenCodeIntegrationConnections(
  integration: Pick<Context['integration'], 'connection'>
): IntegrationConnections {
  return {
    active: async (integrationId) => {
      const connection = await integration.connection.active(integrationId)
      if (connection === undefined) return undefined
      return {
        resolve: async () =>
          (await integration.connection.resolve(connection)) as
            | ConnectionCredential
            | undefined,
      }
    },
  }
}
