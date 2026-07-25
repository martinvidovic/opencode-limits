# opencode-limits

`opencode-limits` adds a native `/limits` popup to OpenCode for usage limits
from connected providers.

The first release supports Codex, OpenCode Zen, and GitHub Copilot. It uses the
accounts already connected to OpenCode and reads their usage data without
refreshing or modifying credentials.

## Install and use

Install `opencode-limits` as an OpenCode plugin, then open the native popup
with `/limits`. The package provides separate `./server` and `./tui` exports;
OpenCode `>=1.14.42 <2` loads the appropriate targets.

To hide Display-only Account Context such as an email address, configure the
plugin with its only v1 option:

```json
{
  "plugin": [["opencode-limits", { "showAccountContext": false }]]
}
```

`showAccountContext` defaults to `true`. It affects rendering only; provider
discovery, credential access, requests, and usage results do not change.

## Supported providers

| Provider       | Matched OpenCode provider ID | Displayed usage                   |
| -------------- | ---------------------------- | --------------------------------- |
| Codex          | `openai`                     | Five-hour and weekly usage limits |
| OpenCode Zen   | `opencode`                   | Today and 30-day usage summaries  |
| GitHub Copilot | `github-copilot`             | Premium and chat request balances |

Provider endpoints and OpenCode credential records are compatibility surfaces.
Failures stay isolated to the affected provider and never include credentials
or raw provider responses. See [Support](SUPPORT.md) for sanitized reporting
guidance.

## Development

Use Node.js 22.14.0 or newer, then run:

```sh
npm install
npm run check
```

The package publishes separate OpenCode v1 `./server` and `./tui` exports and
supports OpenCode `>=1.14.42 <2`.

See [Contributing](CONTRIBUTING.md) for changes and
[Provider Adapter guidance](docs/provider-adapters.md) for proposing a provider.
