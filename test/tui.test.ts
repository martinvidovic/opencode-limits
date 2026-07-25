import { describe, expect, it } from 'vitest'

import { createTuiPlugin } from '../src/tui.js'

describe('TUI plugin', () => {
  it('registers /limits and renders the injected LoadLimits result in a native dialog', async () => {
    const plugin = createTuiPlugin(() => Promise.resolve({ providers: [] }))
    let registeredCommand:
      | { slashName?: string; run: () => Promise<void> }
      | undefined
    const calls: string[] = []
    const api = {
      keymap: {
        registerLayer: ({
          commands,
        }: {
          commands: readonly { slashName?: string; run: () => Promise<void> }[]
        }) => {
          registeredCommand = commands[0]
        },
      },
      lifecycle: { signal: new AbortController().signal },
      ui: {
        DialogAlert: (properties: { title: string; message: string }) =>
          properties,
        dialog: {
          replace: (dialog: () => unknown) => {
            calls.push(JSON.stringify(dialog()))
          },
          setSize: (size: string) => {
            calls.push(size)
          },
        },
      },
    }

    await plugin.tui(api as never, undefined as never, undefined as never)
    await registeredCommand?.run()

    expect(registeredCommand?.slashName).toBe('limits')
    expect(calls).toEqual([
      'large',
      JSON.stringify({
        title: 'Usage limits',
        message:
          'No connected usage providers found.\n\nConnect Codex, OpenCode Zen, or GitHub Copilot, then run /limits again.',
      }),
    ])
  })

  it('rejects invalid privacy configuration without loading providers', async () => {
    let loads = 0
    const plugin = createTuiPlugin(() => {
      loads += 1
      return Promise.resolve({ providers: [] })
    })
    let registeredCommand: { run: () => Promise<void> } | undefined
    const calls: string[] = []
    const api = {
      keymap: {
        registerLayer: ({
          commands,
        }: {
          commands: readonly { run: () => Promise<void> }[]
        }) => {
          registeredCommand = commands[0]
        },
      },
      lifecycle: { signal: new AbortController().signal },
      ui: {
        DialogAlert: (properties: { title: string; message: string }) =>
          properties,
        dialog: {
          replace: (dialog: () => unknown) =>
            calls.push(JSON.stringify(dialog())),
          setSize: (size: string) => calls.push(size),
        },
      },
    }

    await plugin.tui(
      api as never,
      { showAccountContext: 'false' },
      undefined as never
    )
    await registeredCommand?.run()

    expect(loads).toBe(0)
    expect(calls).toEqual([
      'large',
      JSON.stringify({
        title: 'Usage limits',
        message:
          'Invalid opencode-limits configuration. showAccountContext must be a boolean.',
      }),
    ])
  })
})
