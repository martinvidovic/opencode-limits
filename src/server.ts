import type { Plugin } from '@opencode/plugin'

import { createLoadLimits } from './core/load-limits.js'
import type {
  LimitsView,
  ProviderLoadResult,
  RegisteredProvider,
} from './core/model.js'
import { createOpenCodeIntegrationConnections } from './opencode/integration-connections.js'
import { parseLimitsOptions } from './options.js'
import { createCodexRegistration } from './providers/codex/registration.js'
import { createCopilotRegistration } from './providers/copilot/registration.js'
import { createZenRegistration } from './providers/zen/registration.js'
import { limitsRpc, type LimitsRpcOutput } from './rpc.js'

export function createServerPlugin(
  input: {
    readonly registrations?: readonly RegisteredProvider[]
  } = {}
): Plugin.Plugin {
  return {
    id: 'opencode-limits',
    setup: async (context) => {
      const options = parseLimitsOptions(context.options)
      const loadLimits = createLoadLimits({
        connections: createOpenCodeIntegrationConnections(context.integration),
        registrations: input.registrations ?? [
          createCodexRegistration(),
          createZenRegistration(),
          createCopilotRegistration(),
        ],
      })

      await context.rpc.register(limitsRpc, {
        load: async (_input, { signal }): Promise<LimitsRpcOutput> => {
          if (options === undefined) return { status: 'invalid-configuration' }
          const view = await loadLimits({ signal })
          return {
            status: 'loaded',
            view:
              options.showAccountContext === false
                ? withoutAccountContext(view)
                : view,
          }
        },
      })
    },
  }
}

export default createServerPlugin()

function withoutAccountContext(view: LimitsView): LimitsView {
  return {
    providers: view.providers.map((result): ProviderLoadResult => {
      if (result.status === 'failure') {
        const { account: _account, ...rest } = result
        return rest
      }
      const { account: _account, ...snapshot } = result.snapshot
      return { ...result, snapshot }
    }),
  }
}
