import type { TuiPluginModule } from '@opencode-ai/plugin/tui'

import { createLoadLimits } from './core/load-limits.js'
import type { LoadLimits } from './core/model.js'
import { renderLimits } from './presentation/render-limits.js'
import {
  fixtureProvider,
  fixtureProviderDiscovery,
} from './providers/fixture.js'

const fixtureLoadLimits = createLoadLimits({
  discovery: fixtureProviderDiscovery,
  registrations: [fixtureProvider],
})

export function createTuiPlugin(
  loadLimits: LoadLimits = fixtureLoadLimits
): TuiPluginModule {
  return {
    id: 'opencode-limits',
    tui: (api) => {
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
              const view = await loadLimits({ signal: api.lifecycle.signal })
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
