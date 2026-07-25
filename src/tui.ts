import type { TuiPluginModule } from '@opencode-ai/plugin/tui'

import { createLoadLimits } from './core/load-limits.js'
import type { LoadLimits } from './core/model.js'
import { createOpenCodeProviderDiscovery } from './opencode/provider-discovery.js'
import { renderLimits } from './presentation/render-limits.js'
import { createCodexRegistration } from './providers/codex/registration.js'
import { createCopilotRegistration } from './providers/copilot/registration.js'
import { createZenRegistration } from './providers/zen/registration.js'

export interface ILimitsOptions {
  readonly showAccountContext?: boolean
}

export function createTuiPlugin(loadLimits?: LoadLimits): TuiPluginModule {
  return {
    id: 'opencode-limits',
    tui: (api, options) => {
      const resolvedLoadLimits =
        loadLimits ??
        createLoadLimits({
          discovery: createOpenCodeProviderDiscovery(api.client),
          registrations: [
            createCodexRegistration(),
            createZenRegistration(),
            createCopilotRegistration(),
          ],
        })
      api.keymap.registerLayer({
        commands: [
          {
            name: 'opencode-limits.open',
            title: 'Usage limits',
            description: 'Show usage limits for connected providers',
            category: 'Plugin',
            namespace: 'palette',
            slashName: 'limits',
            run: async () => {
              const resolvedOptions = parseOptions(options)
              if (resolvedOptions === undefined) {
                api.ui.dialog.setSize('large')
                api.ui.dialog.replace(() =>
                  api.ui.DialogAlert({
                    title: 'Usage limits',
                    message:
                      'Invalid opencode-limits configuration. showAccountContext must be a boolean.',
                  })
                )
                return
              }
              const view = await resolvedLoadLimits({
                signal: api.lifecycle.signal,
              })
              api.ui.dialog.setSize('large')
              api.ui.dialog.replace(() =>
                api.ui.DialogAlert({
                  title: 'Usage limits',
                  message: renderLimits(view, resolvedOptions),
                })
              )
            },
          },
        ],
      })
      return Promise.resolve()
    },
  }
}

export default createTuiPlugin()

function parseOptions(options: unknown): ILimitsOptions | undefined {
  if (options === undefined) return {}
  if (typeof options !== 'object' || options === null) return undefined

  const { showAccountContext } = options as Record<string, unknown>
  if (
    showAccountContext !== undefined &&
    typeof showAccountContext !== 'boolean'
  ) {
    return undefined
  }

  return showAccountContext === undefined ? {} : { showAccountContext }
}
