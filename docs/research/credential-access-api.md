# Credential access and refresh APIs

Research for [issue #11](https://github.com/martinvidovic/opencode-limits/issues/11), completed 2026-07-18 for the wayfinding map "Ship opencode-limits as a public extensible plugin."

## Decision

OpenCode 1.15.12 does **not** provide a complete supported API through which a published server or TUI plugin can discover Codex, OpenCode Zen, and GitHub Copilot accounts and obtain or refresh their credentials for independent usage calls.

The supported public surface can discover connected **provider IDs**. It can start and complete provider login and can set or remove credentials, but it cannot read credentials. The published server-plugin types additionally expose provider-scoped credential values to provider/auth hooks; those hooks are undocumented, lifecycle-specific extension points rather than a generic account or credential service, have no equivalent in TUI plugins, and do not cover OpenCode Console/Zen accounts. OpenCode's credential refresh implementations remain internal.

## Scope and evidence

This investigation used only:

- Current official [plugin](https://opencode.ai/docs/plugins/), [SDK](https://opencode.ai/docs/sdk/), [server](https://opencode.ai/docs/server/), and [provider](https://opencode.ai/docs/providers/) documentation.
- The locally installed published `@opencode-ai/plugin` and `@opencode-ai/sdk` packages at exactly 1.15.12, including their package exports and generated declarations. The matching source is tag [`v1.15.12`](https://github.com/anomalyco/opencode/tree/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5); the packages declare version 1.15.12 and export the server/TUI plugin and v2 SDK entry points ([plugin package](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/plugin/package.json), [SDK package](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/sdk/js/package.json)).
- Current `anomalyco/opencode` source at commit [`b95fe7b2`](https://github.com/anomalyco/opencode/tree/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298). The credential-facing contracts and internal refresh patterns described below remain present in that snapshot ([plugin types](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/plugin/src/index.ts), [auth storage](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/auth/index.ts), [provider runtime](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/provider/provider.ts), [Console account service](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/account.ts)).
- Official OpenCode auth/provider implementations and the local implementation under assessment, `/Users/martinvidovic/AI/opencode-config/src/plugins/status-codex.ts`.

No `auth.json` contents, SQLite rows, credentials, environment-secret values, keychains, or logs were read.

## Surface classification

### Public documented APIs

| Surface | What it establishes | Credential result |
| --- | --- | --- |
| `GET /provider`, `client.provider.list()` | Returns `all`, defaults, and `connected: string[]`; this is documented as listing available and connected providers ([server docs](https://opencode.ai/docs/server/#provider), [route](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/server/routes/instance/httpapi/groups/provider.ts), [handler](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/server/routes/instance/httpapi/handlers/provider.ts#L39-L57)). | Provider IDs only. `connected` is derived from initialized providers and is not an account list or proof of OAuth credential type. |
| `GET /provider/auth`, OAuth authorize/callback | Lists login methods and runs provider OAuth ([server docs](https://opencode.ai/docs/server/#provider), [provider auth service](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/provider/auth.ts)). | Login orchestration only. Callback persists credentials internally and returns `boolean`, not credentials. |
| `PUT /auth/:providerID`, `DELETE /auth/:providerID`, `client.auth.set/remove()` | Sets or removes credentials ([SDK docs](https://opencode.ai/docs/sdk/#auth), [control routes](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/server/routes/instance/httpapi/groups/control.ts)). | Write/delete only. There is no `GET /auth/:providerID`, SDK `auth.get`, or SDK `auth.list`. |
| Server plugin `PluginInput.client` | Official plugin docs expose an SDK client to server plugins ([plugin docs](https://opencode.ai/docs/plugins/#basic-structure)). | The same write-only auth client; no additional credential accessor. |

The official provider docs say `/connect` stores provider credentials in `~/.local/share/opencode/auth.json` and document Codex/OpenAI and GitHub Copilot login flows ([credentials](https://opencode.ai/docs/providers/#credentials), [OpenAI](https://opencode.ai/docs/providers/#openai), [GitHub Copilot](https://opencode.ai/docs/providers/#github-copilot)). Documentation describes storage and login, not a plugin read API.

### Exported but undocumented APIs

The 1.15.12 server-plugin declaration exports two provider-specific ways for a server plugin to receive raw `Auth` values:

- `ProviderHook.models(provider, { auth })` receives a snapshot for the hook's declared provider ID ([exported type](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/plugin/src/index.ts#L210-L216), [runtime invocation](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/provider/provider.ts#L1270-L1292)).
- `AuthHook.loader(getAuth, provider)` receives a live provider-scoped getter after stored auth exists ([exported type](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/plugin/src/index.ts#L84-L91), [runtime invocation](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/provider/provider.ts#L1415-L1434)).

These are real exported package contracts, but the official plugin documentation does not describe either hook. They are not a general accessor: each participates in model/auth-provider initialization, is scoped to a declared provider ID, and does not enumerate accounts. `ProviderHook.models` supplies a snapshot and no refresh operation. `AuthHook.loader` supplies a getter, but a plugin using it is defining an auth integration for that provider rather than calling a neutral credential service.

The exported 1.15.12 TUI API has `api.client`, provider metadata in `api.state.provider`, and no auth getter ([TUI types](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/plugin/src/tui.ts)). Its `api.client` is the v2 SDK client whose generated `Auth` class has only `set` and `remove`; therefore the server-only hook escape hatches do not apply to a TUI plugin.

The v2 SDK also exports `client.experimental.console.get()` and `listOrgs()`. The corresponding read-only experimental routes return managed provider IDs, active organization name/count, and account/org display metadata, including account ID, email, URL, org ID, and org name ([route schema](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts#L22-L48), [handlers](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts#L33-L73)). They return no token. They are generated/exported but absent from the official server and SDK documentation and explicitly live under `/experimental`.

### Internal modules and refresh behavior

OpenCode itself has credential access and refresh services, but they are application internals, not package exports or server routes:

- The internal `Auth.Service` has `get()` and `all()` over provider auth, whereas the HTTP control plane exposes only set/remove ([internal auth](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/auth/index.ts#L41-L88), [control routes](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/server/routes/instance/httpapi/groups/control.ts)).
- Codex refresh is implemented inside the bundled OpenAI auth loader. On a model fetch, it reads current auth, refreshes an expired access token with the stored refresh token, and persists the replacement through `client.auth.set()` ([Codex implementation](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/plugin/openai/codex.ts#L440-L470)). There is no route or SDK method to invoke this refresh and receive the token.
- GitHub Copilot login stores the same GitHub OAuth token in `refresh` and `access` with `expires: 0`; its loader sends `refresh` as the bearer token and implements no token-refresh exchange ([Copilot implementation](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/plugin/github-copilot/copilot.ts)).
- OpenCode Console account access is internal `Account.Service.token(accountID)`. It treats a token as fresh only when expiry is more than five minutes away; otherwise it posts the refresh token to `${account.url}/auth/device/token`, receives a rotated access token, refresh token, and expiry, and persists all three before returning access ([account service](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/account/account.ts#L136-L140), [refresh](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/account/account.ts#L214-L271)). No public or exported plugin route returns that access token.

The experimental Console read routes call `orgsByAccount()`, which resolves account access internally and may therefore refresh/persist tokens while gathering org metadata; the response still contains no credential ([handler](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts#L33-L73), [account service](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/account/account.ts)). This is not a token-broker API.

## Per-account answer

| Account | Discover through supported API | Obtain credential through supported API | Refresh through supported API |
| --- | --- | --- | --- |
| Codex / ChatGPT OAuth (`openai`) | `provider.list().connected` can show `openai`, but not account identity or auth type. | No public getter. A server provider/auth hook can receive `Auth` through exported-undocumented lifecycle hooks; TUI cannot. | No callable refresh API. Bundled loader refreshes only while serving model traffic and persists internally. |
| OpenCode Zen provider key (`opencode`) | `provider.list().connected` can show the provider, but not the key/account. | No public getter. A server provider/auth hook can receive provider auth when that is the credential source; TUI cannot. | API keys do not use the Console OAuth refresh flow. |
| OpenCode Console/Zen account | No documented account API. Exported-undocumented experimental Console routes can enumerate display/org metadata. | No route or package export returns the Console access token. | Internal `Account.Service.token()` refreshes and persists; it is not exposed to plugins. |
| GitHub Copilot (`github-copilot`) | `provider.list().connected` can show the provider, but not account identity or auth type. | No public getter. A server provider/auth hook can receive `Auth`; TUI cannot. | No separate refresh implementation exists in 1.15.12; the stored GitHub token is used directly. |

## Narrowest source-established read-only fallbacks

These are compatibility facts, not supported-API recommendations.

### Provider auth file: Codex and Copilot

The narrowest read-only fallback for provider credentials is parsing the auth file without modifying it:

- Location is `${Global.Path.data}/auth.json`; `Global.Path.data` is the XDG data directory plus `opencode` ([global paths](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/core/src/global.ts), [auth storage](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/auth/index.ts#L9-L10)). The docs' default is `~/.local/share/opencode/auth.json`; an XDG override changes it.
- Entries are keyed by provider ID. OAuth shape is `{ type: "oauth", refresh, access, expires, accountId?, enterpriseUrl? }`; API auth is `{ type: "api", key, metadata? }` ([auth schema](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/auth/index.ts#L13-L34)). Relevant bundled IDs are `openai` and `github-copilot` ([Codex](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/plugin/openai/codex.ts), [Copilot](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/plugin/github-copilot/copilot.ts)).
- OpenCode first honors `OPENCODE_AUTH_CONTENT`; if that is set, the runtime credential set may differ from the file. A file-only reader cannot discover those credentials ([auth loading](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/auth/index.ts#L56-L69)).
- Reading an expired Codex access token is insufficient. The only established refresh behavior rotates and persists credentials through OpenCode's auth setter. Copilot's implementation instead treats the `refresh` field as the bearer token and records expiry zero.
- The schema and provider field conventions are internal storage compatibility, not a documented plugin contract; they require pinning/testing against OpenCode versions.

### Console SQLite: OpenCode Console/Zen account

The narrowest read-only fallback for a Console account is the internal SQLite schema, with stricter limitations:

- The active row is selected from `account_state` at fixed ID `1`, then joined by `active_account_id` to `account`; `active_org_id` is part of the state ([repository](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/account/repo.ts#L15-L76)).
- The account table stores `id`, `email`, `url`, `access_token`, `refresh_token`, and nullable `token_expiry`; the state table stores active account/org IDs ([schema](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/account/account.sql.ts#L6-L22)).
- Database location is not unconditionally `~/.local/share/opencode/opencode.db`. It is derived from the XDG data directory, can be channel-specific, and can be overridden by `OPENCODE_DB` ([database path](https://github.com/anomalyco/opencode/blob/58a27b95c155d3f7d9b9f25b30eb1233bfb0eae5/packages/opencode/src/storage/db.ts#L28-L45)).
- A read-only consumer can use an existing access token only while it remains valid. The official service refreshes five minutes early and persists a potentially rotated refresh token. A read-only fallback cannot reproduce that state transition safely; refreshing without persisting would diverge from the official rotation behavior.
- Tables, state sentinel, path rules, and refresh threshold are internal and migration-sensitive. They are unsupported direct-storage access, even when opened read-only.

The experimental Console routes are narrower and safer for **discovery metadata** than SQLite, but they cannot satisfy credential-bearing usage calls. Direct SQLite is the only inspected source location containing Console credentials, and no evidence establishes it as a plugin API.

## Compatibility boundary

For a public plugin, the evidence supports these explicit boundaries:

- Public/documented compatibility: provider-ID discovery and login/set/remove orchestration only.
- Exported/undocumented compatibility at 1.15.12: server-only, provider-scoped credential delivery during `provider.models` or `auth.loader`; experimental Console metadata; no TUI credential accessor.
- Internal compatibility: Codex and Console refresh services and credential stores. These are not importable from `@opencode-ai/plugin` or `@opencode-ai/sdk` and are not server routes.
- Unsupported storage compatibility: read-only `auth.json` for Codex/Copilot, and read-only SQLite for a currently valid Console token. Both require exact version/path/schema handling and neither supplies a complete supported refresh path.

## Map impact and follow-up fog

**Decision gist:** treat cross-provider credential acquisition/refresh as an unresolved host-API dependency; provider discovery alone is supported, while a complete public server/TUI credential path does not exist.

Newly surfaced follow-up candidates:

- **Ticket:** Decide whether the public plugin's compatibility contract may include exported-but-undocumented server hooks, and separately whether unsupported read-only storage fallbacks are in scope. The two choices have different host/version support and exclude TUI parity.
- **Ticket:** Define provider capability tiers for Codex, provider-key Zen, Console-account Zen, and Copilot; "connected provider" is not equivalent to "discoverable account with refreshable usage credential."
- **Fog:** Whether OpenCode intends to stabilize a read-only account/credential broker or expose `Account.Service.token()` semantics. Current docs and source establish no commitment.
- **Fog:** Whether independent usage endpoints accept stale/non-rotated credentials across future provider changes. The inspected OpenCode source only establishes how OpenCode itself supplies and refreshes tokens.
