import type { Plugin } from '@opencode/plugin/tui'

import { renderLimits } from './presentation/render-limits.js'
import { isLimitsRpcOutput, limitsRpc } from './rpc.js'

const title = 'Usage limits'
const invalidConfigurationMessage =
  'Invalid opencode-limits configuration. showAccountContext must be a boolean.'
const unavailableMessage =
  'Usage limits are unavailable. Check that the opencode-limits server plugin is loaded, then run /limits again.'

const plugin: Plugin.Definition = {
  id: 'opencode-limits',
  setup: (context) => {
    const lifecycle = new AbortController()
    // Keymap layers belong to a rendered component, so claim an empty app slot.
    const releaseSlot = context.ui.slot({
      append: 'app',
      render: () => {
        registerLimitsCommand(context, lifecycle.signal)
        return null
      },
    })

    return () => {
      lifecycle.abort()
      releaseSlot()
    }
  },
}

export default plugin

function registerLimitsCommand(
  context: Parameters<Plugin.Definition['setup']>[0],
  signal: AbortSignal
): void {
  context.keymap.layer(() => ({
    mode: 'global',
    commands: [
      {
        id: 'opencode-limits.open',
        title,
        description: 'Show usage limits for connected providers',
        group: 'Plugin',
        palette: true,
        slash: { name: 'limits' },
        run: async () => {
          let message: string
          try {
            const output: unknown = await context.client
              .rpc(limitsRpc)
              .load({}, { signal })
            message = renderOutput(output)
          } catch {
            message = unavailableMessage
          }
          if (signal.aborted) return

          // The alert settles when the user closes it; nothing waits on that.
          context.ui.dialog.alert({ title, message }).catch(() => undefined)
          context.ui.dialog.set({ size: 'large' })
        },
      },
    ],
  }))
}

function renderOutput(output: unknown): string {
  if (!isLimitsRpcOutput(output)) return unavailableMessage
  if (output.status === 'invalid-configuration') {
    return invalidConfigurationMessage
  }
  return renderLimits(output.view)
}
