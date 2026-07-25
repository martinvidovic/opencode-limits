import type { PluginModule } from '@opencode-ai/plugin'

const plugin: PluginModule = {
  id: 'opencode-limits',
  server: () => Promise.resolve({}),
}

export default plugin
