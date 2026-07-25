import type { TuiPluginModule } from '@opencode-ai/plugin/tui'

import { createLoadLimits } from './core/load-limits.js'
import type { LoadLimits } from './core/model.js'
import { createOpenCodeProviderDiscovery } from './opencode/provider-discovery.js'
import { renderLimits } from './presentation/render-limits.js'
import { createCodexRegistration } from './providers/codex/registration.js'
import { createCopilotRegistration } from './providers/copilot/registration.js'

export function createTuiPlugin(loadLimits?: LoadLimits): TuiPluginModule {
  return {
    id: 'opencode-limits',
    tui: (api) => {
      const resolvedLoadLimits =
        loadLimits ??
        createLoadLimits({
          discovery: createOpenCodeProviderDiscovery(api.client),
          registrations: [
            createCodexRegistration(),
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
              const view = await resolvedLoadLimits({
                signal: api.lifecycle.signal,
              })
              api.ui.dialog.setSize('large')
              api.ui.dialog.replace(() =>
                api.ui.DialogAlert({
                  title: 'Usage limits',
                  message: renderLimits(view),
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
