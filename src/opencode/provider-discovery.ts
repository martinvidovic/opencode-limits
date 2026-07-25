import type { OpencodeClient } from '@opencode-ai/sdk/v2'

import type { ProviderDiscovery } from '../core/model.js'

export function createOpenCodeProviderDiscovery(
  client: OpencodeClient
): ProviderDiscovery {
  return {
    list: async () => {
      const result = await client.provider.list()
      if (result.data === undefined)
        throw new Error('Provider discovery failed')
      return result.data.connected.map((id) => ({ id }))
    },
  }
}
