# opencode-limits

`opencode-limits` adds a native `/limits` popup to OpenCode for usage limits
from connected providers.

It supports Codex, OpenCode Zen, and GitHub Copilot on OpenCode v2. It reads the
account connections already active in OpenCode, resolves them on the server,
and never modifies credentials.

## Install and use

opencode-limits requires OpenCode v2 (`>=2.0.18 <3`; tested with `2.0.18`). It
does not load in OpenCode v1.

Install it as a global package plugin:

```sh
opencode plugin add opencode-limits
```

Or add it to `plugins` in `opencode.json(c)`:

```json
{
  "plugins": ["opencode-limits"]
}
```

Then open the native popup with `/limits` or from the command palette. OpenCode
loads the server plugin from the package root and the CLI plugin from its
`./tui` export; the CLI receives results from the server over the
`opencode-limits` RPC.

To hide Display-only Account Context such as an email address, use the object
form with its only option:

```json
{
  "plugins": [
    { "package": "opencode-limits", "options": { "showAccountContext": false } }
  ]
}
```

`showAccountContext` defaults to `true`. When it is `false`, the server removes
account context before results reach the CLI; provider discovery, credential
access, requests, and usage data do not change. Any non-boolean value shows an
invalid-configuration message instead of loading usage.

## Supported providers

| Provider       | OpenCode integration ID | Displayed usage                   |
| -------------- | ----------------------- | --------------------------------- |
| Codex          | `openai`                | Five-hour and weekly usage limits |
| OpenCode Zen   | `opencode`              | Today and month-to-date usage     |
| GitHub Copilot | `github-copilot`        | Premium request usage and balance |

Connect providers with `/connect` or `opencode auth login`. A provider without a
connection is omitted from the popup.

## Accounts and credentials

Each provider uses only the integration's active connection. Switch accounts
with `/connect` or `opencode auth switch`; the next `/limits` follows the
switch.

OpenCode stores credentials in its server database and owns their refresh.
opencode-limits resolves the active connection through the OpenCode v2 plugin
API on the server, where OpenCode refreshes OAuth tokens that are near expiry
before returning them. opencode-limits never reads OpenCode's database or
`auth.json`, never writes or refreshes credentials itself, and never sends
credentials to the CLI.

- **Codex** uses the ChatGPT OAuth login of the OpenAI integration, from its
  browser or headless method.
- **OpenCode Zen** uses the OpenCode Console login and reports usage for the
  organization selected in that connection.
- **GitHub Copilot** uses the GitHub.com Copilot login.

These connection modes are not supported and show an unsupported-account
Provider Failure without sending credentials anywhere:

- OpenAI API keys, including `OPENAI_API_KEY` environment connections, and any
  OpenAI OAuth credential not issued by a ChatGPT login method.
- OpenCode Console service-account API keys and custom Console servers other
  than `https://opencode.ai/console`.
- GitHub Enterprise Copilot logins and `GITHUB_TOKEN` environment connections.

## Failures and privacy

Each provider loads independently; one provider's failure never hides another's
usage. A Provider Failure uses a fixed set of reasons, such as reauthentication required,
rate limited, or network unavailable, and never include credentials, raw
provider responses, or error text from providers. See [Support](SUPPORT.md) for
sanitized reporting guidance.

Provider endpoints and OpenCode integration connections are compatibility
surfaces that can change between OpenCode and provider releases.

## Development

Use Node.js 22.14.0 or newer, then run:

```sh
npm install
npm run check
```

The package publishes an OpenCode v2 server plugin (`.`), CLI plugin
(`./tui`), and RPC contract (`./rpc`).

See [Contributing](CONTRIBUTING.md) for changes and
[Provider Adapter guidance](docs/provider-adapters.md) for proposing a provider.
