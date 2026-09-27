# opencode-limits

`opencode-limits` adds a native `/limits` popup to OpenCode for usage limits
from connected providers.

It supports Codex, OpenCode Zen, and GitHub Copilot on OpenCode v2. It uses the active account connections
already in OpenCode, resolved on the server, and never modifies credentials.

## Install and use

Add `opencode-limits` to `plugins` in OpenCode v2 `opencode.json(c)`, then
open the native popup with `/limits`. OpenCode loads the server plugin from the
package root and the CLI plugin from its `./tui` export.

To hide Display-only Account Context such as an email address, use the
object form with its only option:

```json
{
  "plugins": [
    { "package": "opencode-limits", "options": { "showAccountContext": false } }
  ]
}
```

`showAccountContext` defaults to `true`. When it is `false`, the server removes
account context before results reach the CLI; provider discovery, credential
access, requests, and usage data do not change.

## Supported providers

| Provider       | OpenCode integration ID | Displayed usage                   |
| -------------- | ----------------------- | --------------------------------- |
| Codex          | `openai`                | Five-hour and weekly usage limits |
| OpenCode Zen   | `opencode`              | Today and month-to-date usage     |
| GitHub Copilot | `github-copilot`        | Premium and chat request balances |

OpenCode Zen reads the active OpenCode Console connection and reports usage for
the organization selected in that connection. Only the official Console
(`https://opencode.ai/console`) with a signed-in account is queried; custom
Console servers and service-account API keys show an unsupported-account
failure. When a token is near expiry, OpenCode refreshes and stores it while
resolving the connection; opencode-limits never writes credentials.

GitHub Copilot reads the active Copilot connection and queries GitHub.com with
its GitHub OAuth token. GitHub Enterprise logins and `GITHUB_TOKEN` environment
connections show an unsupported-account failure instead of being sent to the
public endpoint.

Each provider uses only its active connection; switch accounts with `/connect`
or `opencode auth switch`.

Provider endpoints and OpenCode integration connections are compatibility
surfaces.
Failures stay isolated to the affected provider and never include credentials
or raw provider responses. See [Support](SUPPORT.md) for sanitized reporting
guidance.

## Development

Use Node.js 22.14.0 or newer, then run:

```sh
npm install
npm run check
```

The package publishes an OpenCode v2 server plugin (`.`), CLI plugin
(`./tui`), and RPC contract (`./rpc`) and supports OpenCode `>=2.0.18 <3`.

See [Contributing](CONTRIBUTING.md) for changes and
[Provider Adapter guidance](docs/provider-adapters.md) for proposing a provider.
