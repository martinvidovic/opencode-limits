# Supported OpenCode TUI plugin contract

Research for [opencode-limits issue #2](https://github.com/martinvidovic/opencode-limits/issues/2), against the locally installed `@opencode-ai/plugin@1.15.12` and the matching OpenCode `v1.15.12` source.

## Decision

Publish one ESM npm package with two target-specific subpath exports, `./server` and `./tui`. Each subpath must default-export a different v1 module object: `{ id, server }` for the server and `{ id, tui }` for the TUI. Register `/limits` through `api.keymap.registerLayer` with `namespace: "palette"` and `slashName: "limits"`, render the host-native `api.ui.DialogAlert` through `api.ui.dialog.replace`, and use the host-scoped registrations plus `api.lifecycle` for cleanup. Do not use `api.command` or `oc-plugin`.

Set `engines.opencode` to `">=1.14.42 <2"`. `v1.14.42` is the first release containing the non-deprecated keymap command API; the upper bound avoids claiming compatibility across the in-progress v2 plugin boundary. Develop and typecheck against the currently installed `@opencode-ai/plugin@1.15.12`.

## Evidence classification

| Status | Evidence | Consequence |
| --- | --- | --- |
| Documented public API | The public plugin docs document npm plugins in `opencode.json`, automatic Bun installation, ESM plugin functions, and `@opencode-ai/plugin` types. The config docs likewise document the `plugin` array. [Official plugin docs](https://opencode.ai/docs/plugins/#from-npm), [official config docs](https://opencode.ai/docs/config/#plugins) | The server side and npm package-name installation are supported user-facing behavior. |
| Repository-documented and exported, but absent from the public website docs | The official repository's TUI technical reference specifies `tui.json`, `@opencode-ai/plugin/tui`, target-specific exports, keymap commands, dialogs, and lifecycle. The published package exports `./tui`, but the public plugin page has no TUI authoring section. [TUI technical reference](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/specs/tui-plugins.md), [published 1.15.12 metadata](https://registry.npmjs.org/@opencode-ai%2fplugin/1.15.12), [public plugin docs](https://opencode.ai/docs/plugins/) | The TUI contract is concrete and shipped, but has a weaker stability promise than the website-documented server plugin API. Keep the integration narrow and version-gated. |
| Deprecated API | `api.command` is optional and marked deprecated in the 1.15.12 exported types; the source says to use `api.keymap.registerLayer`, `dispatchCommand`, and the keymap command palette instead, and says the shim will be removed in v2. [1.15.12 TUI types](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/src/tui.ts#L86-L120), [command shim](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/cli/cmd/tui/plugin/command-shim.ts#L85-L108) | The existing `status-codex.ts` use of `api.command.register` must not be carried forward. |
| Removed legacy metadata | `oc-plugin` was introduced with the early TUI installer, then replaced by entrypoint inference and per-export `config` metadata in commit `25a2b739e`. Current 1.15.12 install code never reads `oc-plugin`. [removal commit](https://github.com/anomalyco/opencode/commit/25a2b739e68a98dd027aa3d5cef187ad4242d1ff), [current target detection](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/install.ts#L105-L165) | Do not publish `oc-plugin`. One surviving mention in the technical reference is stale and contradicted by the source that owns manifest parsing. |
| Inferred recommendation | The exact minimum version, dependency placement, and v2 upper bound are derived from release ancestry, published manifests, and the subset of APIs this plugin needs. | Treat the recommended version range as a compatibility decision, not an OpenCode promise. Add a runtime compatibility smoke test before lowering or widening it. |

## Package contract

### Required entrypoints

Use separate built files and explicit subpath exports:

```json
{
  "name": "opencode-limits",
  "type": "module",
  "files": ["dist"],
  "exports": {
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.js"
    },
    "./tui": {
      "types": "./dist/tui.d.ts",
      "import": "./dist/tui.js"
    }
  },
  "engines": {
    "opencode": ">=1.14.42 <2"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "1.15.12"
  }
}
```

OpenCode detects a server target from `exports["./server"]` or `main`, and a TUI target from `exports["./tui"]` (or valid `oc-themes` for a theme-only package). It does not use the root `exports["."]` for either target when target-specific exports are present, and TUI never falls back to `main`. [manifest detection](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/install.ts#L105-L165), [entrypoint resolution](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/shared.ts#L71-L114), [loader tests](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/test/cli/tui/plugin-loader-entrypoint.test.ts#L13-L134)

The root export is optional for OpenCode loading. If added for another consumer, it must not be relied on by the plugin loader.

Each target file is exclusive:

```ts
// server.ts
export default { id: "opencode-limits", server }

// tui.ts
export default { id: "opencode-limits", tui }
```

The loader reads only the default export object, rejects a module containing both `server` and `tui`, requires a file plugin to declare an id, and falls back to the npm package name when an npm module omits one. [module validation and identity](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/shared.ts#L264-L322), [exported module types](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/src/index.ts#L51-L56), [TUI module type](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/src/tui.ts#L628-L634)

Although the server runtime still accepts legacy function/named exports, that is a v0 fallback. A new package should use the default `{ id, server }` v1 shape to match the TUI target and reduce migration surface. [server fallback](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/index.ts#L84-L120)

### `oc-plugin` and default options

There is no required `oc-plugin` field in 1.15.12. It was removed before the selected minimum version. The current installer infers targets from the package entrypoints. [removal commit](https://github.com/anomalyco/opencode/commit/25a2b739e68a98dd027aa3d5cef187ad4242d1ff), [1.15.12 installer](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/install.ts#L128-L165)

OpenCode supports a nonstandard `config` object alongside each export's `import` target. The installer writes those values as the initial `[package, options]` tuple in the corresponding config. It is optional and should only be used if `opencode-limits` has meaningful defaults:

```json
{
  "exports": {
    "./server": {
      "import": "./dist/server.js",
      "config": { "example": true }
    },
    "./tui": {
      "import": "./dist/tui.js",
      "config": { "example": true }
    }
  }
}
```

This `config` key is OpenCode-specific, exported-but-undocumented behavior, not standard npm conditional-export metadata. [option extraction](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/install.ts#L105-L137), [config patching](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/install.ts#L333-L389)

### Dependencies and peers

The published `@opencode-ai/plugin@1.15.12` package is the authoritative type package. It exports `./tui`, depends on the matching SDK `1.15.12`, and declares optional OpenTUI peers `@opentui/core`, `@opentui/keymap`, and `@opentui/solid` at `>=0.2.16`. [npm metadata](https://registry.npmjs.org/@opencode-ai%2fplugin/1.15.12), [source manifest](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/package.json#L11-L47)

For the proposed `/limits` alert, import `Plugin`, `PluginModule`, `TuiPlugin`, and `TuiPluginModule` with `import type` only and call host-provided API functions. That leaves no `@opencode-ai/plugin` or OpenTUI runtime import in the built JavaScript. Therefore:

- Pin `@opencode-ai/plugin` to `1.15.12` in `devDependencies` for reproducible typechecking.
- No runtime peer dependency is required for the native alert-only TUI implementation.
- If implementation later imports JSX/runtime APIs directly from OpenTUI, declare only those directly imported packages as peers and dev dependencies. For an exact 1.15.12 build, the first-party floor is `>=0.2.16`; do not copy all three peers blindly.
- Use `engines.opencode`, not an npm dependency on the OpenCode CLI, to express host compatibility. The loader checks this range for npm plugins and skips incompatible packages; local file plugins bypass the check. [compatibility check](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/shared.ts#L194-L205), [loader enforcement](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/loader.ts#L121-L131)

The no-runtime-peer recommendation is inferred from the emitted-import boundary. If JSX or raw renderer APIs become necessary, revisit it.

## Installation contract

### Preferred installation

The source-supported installer is:

```sh
opencode plugin opencode-limits
```

`opencode plug opencode-limits` is an alias, and `--global` selects global scope. The installer installs the package, detects all package targets, and writes the server target into `opencode.json` and the TUI target into `tui.json`. [CLI command](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/cli/cmd/plug.ts#L70-L175), [target-to-config mapping](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/install.ts#L333-L343)

This combined installer is repository-documented/exported behavior, not yet described by the public plugin website. It is still preferable because it avoids asking users to edit two files manually.

### Manual installation

Manual configuration requires the same package in both target configs:

```json
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-limits"]
}
```

```json
// tui.json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-limits"]
}
```

The server `plugin` array is website-documented. The TUI `plugin` array is present in the 1.15.12 schema and repository technical reference but absent from the website's TUI/config authoring docs. [public npm plugin configuration](https://opencode.ai/docs/plugins/#from-npm), [TUI schema](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/cli/cmd/tui/config/tui-schema.ts#L73-L88), [TUI config reference](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/specs/tui-plugins.md#L15-L57)

The public custom-command mechanism (`command` config or Markdown under `commands/`) sends a prompt to the model. It is not the registration mechanism for a native plugin popup. [official command docs](https://opencode.ai/docs/commands/)

## `/limits` TUI behavior

### Registration

Use the non-deprecated keymap layer API:

```ts
api.keymap.registerLayer({
  commands: [
    {
      name: "opencode-limits.open",
      title: "Limits",
      category: "Plugin",
      namespace: "palette",
      slashName: "limits",
      run() {
        // Fetch and open the native dialog.
      }
    }
  ]
})
```

`namespace: "palette"` makes the command a host palette command; `slashName: "limits"` registers `/limits`; `slashAliases` is available if aliases are needed. The first-party smoke plugin uses the same fields for its slash commands. [keymap reference](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/specs/tui-plugins.md#L247-L257), [first-party smoke plugin](https://github.com/anomalyco/opencode/blob/v1.15.12/.opencode/plugins/tui-smoke.tsx#L868-L929)

Do not add the 1.15.12 `mode: "base"` layer field while claiming the 1.14.42 minimum without a compatibility test: mode-aware layers are newer than the initial keymap contract and are unnecessary for a slash-only command. On a 1.15.12-only baseline, `mode: "base"` would appropriately limit the command to normal app interaction. [mode-aware layers](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/specs/tui-plugins.md#L259-L290)

Do not feature-detect `api.command` or call `api.command.register`. In 1.15.12 it is only a warning shim over `registerLayer`, and its type says it will be removed in v2. [deprecated types](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/src/tui.ts#L86-L120), [shim implementation](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/cli/cmd/tui/plugin/command-shim.ts#L49-L108)

### Native dialog

Use the host dialog stack and host alert component:

```ts
api.ui.dialog.setSize("large")
api.ui.dialog.replace(() =>
  api.ui.DialogAlert({ title: "Usage limits", message })
)
```

`DialogAlert` accepts `title`, `message`, and optional `onConfirm`; the dialog stack provides `replace`, `clear`, and `setSize`. These are exported API types, and the first-party smoke plugin renders the same host-native alert through the same stack. [dialog types](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/src/tui.ts#L122-L148), [TUI API surface](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/src/tui.ts#L599-L609), [first-party alert](https://github.com/anomalyco/opencode/blob/v1.15.12/.opencode/plugins/tui-smoke.tsx#L218-L245)

Calling the host component as a function avoids a direct JSX runtime dependency for this simple text alert. A custom rich popup would cross into direct OpenTUI/Solid dependencies and should be a separate decision.

### Disposal

TUI initialization returns `Promise<void>`, not a disposer. Cleanup rules are:

- Keymap registrations, route registrations, event subscriptions, slot registrations, and mode pushes made through the plugin-scoped API are tracked and disposed automatically.
- Use `api.lifecycle.signal` for cancellable asynchronous work. The host aborts it before cleanup.
- Use `api.lifecycle.onDispose` only for unmanaged resources such as timers, raw renderer hooks, or other external subscriptions. Cleanup may be async.
- Do not separately register the disposer returned by `api.keymap.registerLayer`; the scoped keymap already tracks it.
- The server target returns hooks and may provide `dispose?: () => Promise<void>` for its own resources.

The runtime aborts first, cleans in reverse order, awaits cleanup, and applies a five-second total budget per plugin. [lifecycle types](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/src/tui.ts#L519-L528), [scoped keymap tracking](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/cli/cmd/tui/plugin/runtime.ts#L145-L161), [scope disposal](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/cli/cmd/tui/plugin/runtime.ts#L430-L488), [server dispose hook](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/plugin/src/index.ts#L171-L179), [first-party explicit cleanup](https://github.com/anomalyco/opencode/blob/v1.15.12/.opencode/plugins/tui-smoke.tsx#L981-L1008)

The existing local implementation does not satisfy this contract: it uses deprecated `api.command.register`, throws when the shim is absent, and has no lifecycle cancellation tied to TUI deactivation. This observation is based only on `/Users/martinvidovic/AI/opencode-config/src/plugins/status-codex.ts`; no auth files, databases, or credentials were read.

## Minimum version and v2 boundary

The package/export installer and lifecycle APIs predate the selected minimum. The limiting API is `api.keymap.registerLayer`, introduced by first-party commit `98f5e6e` and first released in `v1.14.42`. `v1.14.41` still exposed the old command/keybind API, while the published `@opencode-ai/plugin@1.14.42` package contains `./tui`, the keymap types, and OpenTUI `>=0.2.6` peers. [keymap introduction](https://github.com/anomalyco/opencode/commit/98f5e6e71334c3b600ad325441a022b7fcb4098a), [v1.14.42 release](https://github.com/anomalyco/opencode/releases/tag/v1.14.42), [1.14.42 npm metadata](https://registry.npmjs.org/@opencode-ai%2fplugin/1.14.42)

Therefore `engines.opencode: ">=1.14.42 <2"` is the API-derived minimum. The implementation should still compile against `1.15.12`, because that is the locally installed and directly inspected API. The OpenCode loader enforces the engine range for npm plugins. [engine enforcement](https://github.com/anomalyco/opencode/blob/v1.15.12/packages/opencode/src/plugin/shared.ts#L194-L205)

V2 constraints:

- `api.command` is explicitly scheduled for removal in v2. Avoiding it is mandatory.
- V1 modules are target-exclusive. Keep server and TUI files separate instead of exporting both functions from one object.
- The legacy server function/named-export fallback should not be used by new code.
- OpenCode `v1.18.3` still exports the same v1 TUI module type and deprecated command shim, but it has also added separate v2 server plugin exports and raised OpenTUI peer floors. There is not yet a published v2 TUI replacement in the inspected sources. [v1.18.3 plugin manifest](https://github.com/anomalyco/opencode/blob/v1.18.3/packages/plugin/package.json), [v1.18.3 TUI types](https://github.com/anomalyco/opencode/blob/v1.18.3/packages/plugin/src/tui.ts)
- Keep `<2` until a dedicated v2 migration ticket identifies the replacement TUI contract and verifies it.

## Answer by question

| Question | Answer |
| --- | --- |
| How is a server+TUI npm plugin packaged? | One ESM package, separate `./server` and `./tui` exports, separate default-exported target-exclusive v1 module objects. |
| What exports and metadata are required? | `name`, `type: module`, `exports["./server"]`, `exports["./tui"]`, and an `engines.opencode` range. `oc-plugin` is obsolete. Per-export `config` is optional first-install options metadata. |
| How is it installed? | Prefer `opencode plugin opencode-limits`, which patches both configs. Manual fallback lists the package in both `opencode.json` and `tui.json`. |
| How is `/limits` registered? | `api.keymap.registerLayer`, command `namespace: "palette"`, stable unique `name`, and `slashName: "limits"`. |
| How is the popup rendered? | `api.ui.dialog.setSize(...)` and `api.ui.dialog.replace(() => api.ui.DialogAlert(...))`. |
| How is it disposed? | Rely on scoped API cleanup; use `api.lifecycle.signal` and `onDispose` for unmanaged work; return server `Hooks.dispose` where needed. |
| What dependencies are needed? | Pin `@opencode-ai/plugin@1.15.12` for development. Native host API use creates no runtime OpenTUI peer requirement. Add peers only for packages imported directly at runtime. |
| What is the minimum OpenCode version? | `1.14.42`, expressed as `>=1.14.42 <2`; typecheck against `1.15.12`. |

## Follow-up fog and ticket suggestions

- **Fog: TUI stability.** The TUI API is exported and first-party repository-documented but missing from the public website docs. Treat it as supported-in-source rather than a long-term stable public promise.
- **Ticket: compatibility smoke matrix.** Before release, install the packed npm tarball into OpenCode `1.14.42`, `1.15.12`, and latest v1; verify both target entrypoints, `/limits`, native dialog rendering, deactivation cleanup, and `engines.opencode` rejection.
- **Ticket: v2 migration watch.** Track the eventual v2 TUI module/API and decide when to widen `engines.opencode`; do not solve this speculatively in the v1 implementation.
- **Fog: direct OpenTUI adoption.** A future rich custom dialog would add fast-moving OpenTUI peer constraints (`0.2.6` at OpenCode 1.14.42, `0.2.16` at 1.15.12, and `0.4.3` at 1.18.3). Stay with host-native `DialogAlert` unless richer UI has a concrete requirement.

## Sources inspected

- Current official OpenCode website docs for [plugins](https://opencode.ai/docs/plugins/), [configuration](https://opencode.ai/docs/config/), and [commands](https://opencode.ai/docs/commands/).
- Official `anomalyco/opencode` source at tag [`v1.15.12`](https://github.com/anomalyco/opencode/tree/v1.15.12), plus release ancestry around `v1.14.42` and a forward check at `v1.18.3`.
- Local installed package manifest and types under `/Users/martinvidovic/.config/opencode/node_modules/@opencode-ai/plugin/`, verified as version `1.15.12`.
- Official npm registry metadata for [`@opencode-ai/plugin@1.15.12`](https://registry.npmjs.org/@opencode-ai%2fplugin/1.15.12) and [`@opencode-ai/plugin@1.14.42`](https://registry.npmjs.org/@opencode-ai%2fplugin/1.14.42).
- First-party OpenCode smoke plugin and loader/lifecycle tests in the official repository. No community plugin was used to establish the contract.
- Existing local implementation `/Users/martinvidovic/AI/opencode-config/src/plugins/status-codex.ts`. Credentials, `auth.json`, databases, and secrets were not inspected.
