import { describe, expect, it } from 'vitest'

import { limitsRpc } from '../src/rpc.js'
import tui from '../src/tui.js'

interface ICommand {
  readonly id?: string
  readonly palette?: true
  readonly slash?: { readonly name: string }
  readonly run: () => Promise<void> | void
}

describe('CLI plugin', () => {
  it('registers /limits and renders the server RPC result in a native dialog', async () => {
    const host = createHost(() =>
      Promise.resolve({ status: 'loaded', view: { providers: [] } })
    )

    await tui.setup(host.context as never)
    await host.command().run()

    expect(tui.id).toBe('opencode-limits')
    expect(host.layer()).toMatchObject({ mode: 'global' })
    expect(host.command()).toMatchObject({
      id: 'opencode-limits.open',
      palette: true,
      slash: { name: 'limits' },
    })
    expect(host.definitions).toEqual([limitsRpc])
    expect(host.inputs).toEqual([{}])
    expect(host.calls).toEqual([
      {
        alert: {
          title: 'Usage limits',
          message:
            'No connected usage providers found.\n\nConnect a supported provider with /connect, then run /limits again.',
        },
      },
    ])
  })

  it('shows a safe message for invalid configuration', async () => {
    const host = createHost(() =>
      Promise.resolve({ status: 'invalid-configuration' })
    )

    await tui.setup(host.context as never)
    await host.command().run()

    expect(host.calls[0]).toEqual({
      alert: {
        title: 'Usage limits',
        message:
          'Invalid opencode-limits configuration. showAccountContext must be a boolean.',
      },
    })
  })

  it('replaces RPC failures and malformed results with a bounded message', async () => {
    const failing = createHost(() =>
      Promise.reject(new Error('rpc.unavailable token-canary'))
    )
    const malformed = createHost(() =>
      Promise.resolve({ status: 'loaded', secret: 'token-canary' })
    )

    await tui.setup(failing.context as never)
    await tui.setup(malformed.context as never)
    await failing.command().run()
    await malformed.command().run()

    const message = {
      alert: {
        title: 'Usage limits',
        message:
          'Usage limits are unavailable. Check that the opencode-limits server plugin is loaded, then run /limits again.',
      },
    }
    expect(failing.calls[0]).toEqual(message)
    expect(malformed.calls[0]).toEqual(message)
    expect(JSON.stringify([failing.calls, malformed.calls])).not.toContain(
      'canary'
    )
  })

  it('aborts an in-flight load on cleanup without opening a dialog', async () => {
    let received: AbortSignal | undefined
    const host = createHost(
      (signal) =>
        new Promise((_resolve, reject) => {
          received = signal
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    const cleanup = await tui.setup(host.context as never)
    const running = host.command().run()
    if (typeof cleanup === 'function') await cleanup()
    await running

    expect(received?.aborted).toBe(true)
    expect(host.calls).toEqual([])
    expect(host.isReleased).toBe(true)
  })
})

function createHost(load: (signal: AbortSignal) => Promise<unknown>) {
  let layer:
    | (() => {
        readonly mode?: string
        readonly commands?: readonly ICommand[]
      })
    | undefined
  const calls: unknown[] = []
  const definitions: unknown[] = []
  const inputs: unknown[] = []
  let isReleased = false
  const context = {
    options: {},
    client: {
      rpc: (definition: unknown) => {
        definitions.push(definition)
        return {
          load: (input: unknown, options: { signal: AbortSignal }) => {
            inputs.push(input)
            return load(options.signal)
          },
        }
      },
    },
    keymap: {
      layer: (input: typeof layer) => {
        layer = input
      },
    },
    ui: {
      slot: (claim: { append: string; render: () => unknown }) => {
        if (claim.append === 'app') claim.render()
        return () => {
          isReleased = true
        }
      },
      dialog: {
        alert: (options: unknown) => {
          calls.push({ alert: options })
          return Promise.resolve()
        },
        set: (options: unknown) => calls.push({ set: options }),
      },
    },
  }

  return {
    context,
    calls,
    definitions,
    inputs,
    get isReleased() {
      return isReleased
    },
    layer: () => layer?.(),
    command: (): ICommand => {
      const command = layer?.().commands?.[0]
      if (command === undefined) throw new Error('No command registered')
      return command
    },
  }
}
