# Credential and endpoint risk inventory

Research for [Inventory credential and endpoint risks](https://github.com/martinvidovic/opencode-limits/issues/3), part of the wayfinding map [Ship opencode-limits as a public extensible plugin](https://github.com/martinvidovic/opencode-limits/issues/1).

## Decision gist

Treat all three usage integrations as best-effort adapters over mutable account interfaces: consume only narrowly scoped OpenCode-managed credentials, never refresh by writing OpenCode's SQLite database directly, and fail closed with strict secret redaction when credentials, origins, endpoints, or response schemas do not match expectations.

## Scope and method

This report inventories the behavior of `/Users/martinvidovic/AI/opencode-config/src/plugins/status-codex.ts` as inspected on 2026-07-18. No credential value, `auth.json` content, database row, keychain entry, environment secret, or log was read. The investigation used only source code, public provider documentation, and unauthenticated endpoint behavior.

Primary-source snapshots:

- OpenCode source at [`b95fe7b2`](https://github.com/anomalyco/opencode/tree/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298).
- OpenAI Codex source at [`56395bdd`](https://github.com/openai/codex/tree/56395bddaf26eb2829387ca6a417bf9128e5b239).
- Current provider documentation from [OpenAI](https://developers.openai.com/codex/auth/), [GitHub](https://docs.github.com/en/copilot/reference/copilot-allowlist-reference), and [OpenCode](https://opencode.ai/docs/providers/).

The classifications below distinguish two ideas that are easy to conflate:

- **Documented/public** means the provider publishes the behavior as an interface consumers may use.
- **Provider-owned source** means the provider's own client currently uses it. This is strong evidence of present behavior, but it is not a stability or support promise.
- **Private/undocumented** means no public contract for the exact route, fields, or semantics was found. Such an interface may change without deprecation.
- **Unknown** means the reviewed primary sources do not support a stronger conclusion.

## Executive findings

1. OpenCode intentionally stores provider OAuth records in `auth.json`, but the current plugin bypasses OpenCode's auth service and reads the entire plaintext file. It consequently misses `OPENCODE_AUTH_CONTENT`, does not benefit from schema validation, and gains access to unrelated provider secrets it does not need. OpenCode writes this file with mode `0600`, but file permissions do not make broad in-process secret access a stable plugin contract. [OpenCode auth source](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/auth/index.ts#L10-L35) [read/write behavior](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/auth/index.ts#L58-L89)
2. The highest mutation risk is OpenCode Console refresh. The plugin opens OpenCode's internal SQLite database, sends the stored refresh token to the stored Console origin, and directly overwrites access token, refresh token, expiry, and update time. OpenCode's own code refreshes through its account service and repository; direct third-party SQL bypasses that owner, its schema decoder, database-path selection, concurrency controls, and future migrations. [OpenCode account schema](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/core/src/account/sql.ts#L6-L22) [official refresh flow](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/account.ts#L216-L246) [official persistence path](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/repo.ts#L104-L122)
3. Codex usage is implemented by OpenAI's own Codex client at the same `chatgpt.com/backend-api/wham/usage` route and with the same bearer/account header shape. However, the route is a ChatGPT backend path, not a documented public API. Its availability and payload remain mutable. [OpenAI endpoint source](https://github.com/openai/codex/blob/56395bddaf26eb2829387ca6a417bf9128e5b239/codex-rs/backend-client/src/client/rate_limit_resets.rs) [OpenAI request-header source](https://github.com/openai/codex/blob/56395bddaf26eb2829387ca6a417bf9128e5b239/codex-rs/backend-client/src/client.rs)
4. GitHub documents `https://api.github.com/copilot_internal/*` only as a Copilot user-management allowlist family. It does not document `GET /copilot_internal/user`, its personal quota fields, or their compatibility. The exact endpoint is therefore private/undocumented even though its host and namespace are provider-recognized. [GitHub Copilot allowlist](https://docs.github.com/en/copilot/reference/copilot-allowlist-reference#github-public-urls) [documented Copilot REST APIs](https://docs.github.com/en/rest/copilot/copilot-user-management)
5. OpenCode's source supports Console device token refresh, `/api/user`, and `/api/orgs`, but the reviewed source and docs do not publish the exact `/api/usage/summary` query or response as a consumer contract. Zen usage summary should therefore be treated as private/undocumented; whether it is intended for external clients is unknown. [OpenCode account service](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/account.ts#L216-L309) [Zen public docs](https://opencode.ai/docs/zen/)
6. Console `account.url` is a real trust boundary, not merely configuration. OpenCode defaults it to `https://console.opencode.ai` but accepts a login URL and persists the normalized origin/path. The plugin sends both access and refresh tokens to routes derived from that stored URL. A public plugin must not silently treat an arbitrary stored origin as equivalent to the official service. [default and custom login URL](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/cli/cmd/account.ts#L18-L45) [persisted URL](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/repo.ts#L124-L151)

## Local credential and state inventory

| Source | Current read/write | Official status | Mutation and leakage risk | Required behavior |
| --- | --- | --- | --- | --- |
| `$XDG_DATA_HOME/opencode/auth.json`, falling back to `~/.local/share/opencode/auth.json` | Reads the entire file synchronously, parses JSON, and selects `openai` and `github-copilot`; no write | The file and provider records are official OpenCode state. OpenCode also supports `OPENCODE_AUTH_CONTENT`, validates records, and writes file state with `0600`; raw file access by third-party plugins is not documented as a stable API. | Process receives every provider secret in the file. The plugin does not verify file ownership/mode and ignores the env-backed auth source. Parse failure is collapsed into an unreadable-file status and then discarded by the caller. | Request only the named provider record through an owner-mediated API if one is available. Never enumerate, copy, log, serialize, or include unrelated entries in errors. Treat absent, malformed, wrong-type, and inaccessible state separately but redact paths and contents. |
| OpenAI OAuth record: `type`, `access`, `accountId`, `expires` | Read only | Fields match OpenCode's OAuth schema. The omitted `refresh` field is also part of that schema. | Bearer token and account ID are secrets/sensitive identifiers. Read-only behavior avoids token rotation races, but an expired token cannot recover even though OpenCode owns a refresh flow. | Never refresh independently from this adapter. Ask the credential owner for a current access token or report reauthentication without exposing token data. |
| GitHub Copilot OAuth record: `type`, `access`, `refresh` | Read only; chooses `access || refresh` | OpenCode's GitHub device flow is official source and requests `read:user`. It stores the returned GitHub access token in both `access` and `refresh` with `expires: 0`; `refresh` is a compatibility field here, not evidence of an OAuth refresh token. [OpenCode Copilot login](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/plugin/github-copilot/copilot.ts#L222-L299) [GitHub device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) | Long-lived GitHub bearer token; compromise can expose whatever the issued token authorizes. Calling the fallback field a refresh token would be misleading. | Treat both fields as the same class of bearer secret; do not attempt refresh. Prefer the field semantics supplied by OpenCode rather than guessing from the property name. |
| OpenCode database selected by fixed `.../opencode/opencode.db` | Checks existence, opens with `bun:sqlite`, joins `account` and singleton `account_state`, and reads ID, email, URL, access token, refresh token, expiry, and active org ID | Tables and columns are official internal source, not a public plugin contract. OpenCode may instead select `OPENCODE_DB` or a channel-specific database filename. [database selection](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/core/src/database/database.ts#L43-L55) | Reads two live bearer secrets and sensitive account metadata. Fixed path can select stale/wrong state. Schema changes, locks, or a missing active org can fail the entire popup. | Do not discover live account state by hard-coded database path/schema. If no supported account API exists, report Console status unavailable rather than probing alternate files. Isolate failure to Zen. |
| Same OpenCode database, `account` row | After refresh, directly updates `access_token`, `refresh_token`, `token_expiry`, and `time_updated` | Unsupported direct mutation. OpenCode configures WAL, a 5-second busy timeout, migrations, decoding, and repository writes in its own database layer; the plugin's independent connection does not reproduce that ownership boundary. [database setup](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/core/src/database/database.ts#L22-L36) | Critical: races with OpenCode refresh, last-writer-wins stale-token overwrite, schema drift, lock failure, update of zero rows, and partial refresh. If the server rotates a refresh token and the SQL write fails, the returned replacement is discarded and the stored token may no longer work. Rotation guarantees are unknown, so the stranded-session outcome is a risk, not a claimed certainty. | Prohibit direct database writes. Token refresh and persistence must be one owner-mediated operation. A usage adapter should remain read-only and must not make a successful status view capable of corrupting login state. |

OpenCode's data directory is derived from XDG paths. The baseline's fallback is consistent with the documented Unix location, but only OpenCode itself knows all platform, channel, and override rules. [OpenCode global paths](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/core/src/global.ts#L10-L31) [provider credential docs](https://opencode.ai/docs/providers/#credentials)

## Token decode and refresh inventory

### Codex / ChatGPT

- The baseline base64url-decodes the middle segment of the **access token** and reads only profile email and ChatGPT plan claims for display. It does not verify JWT signature, issuer, audience, or claim types. It catches malformed data and shows `unknown`.
- OpenAI's Codex source confirms those names exist in ChatGPT token data and also cautions that plan values may vary by backend. That source parses JWT data for account display/selection; it does not turn an unverified decode into authorization. [OpenAI token parser](https://github.com/openai/codex/blob/56395bddaf26eb2829387ca6a417bf9128e5b239/codex-rs/login/src/token_data.rs)
- The baseline checks OpenCode's `expires` timestamp with a 60-second buffer. It never reads or sends the OpenAI refresh token and never mutates OpenCode auth state. Expired/missing access means re-login.
- OpenCode's bundled OpenAI adapter does refresh against `https://auth.openai.com/oauth/token` and persists the replacement through `input.client.auth.set`; that is credential-owner behavior, not a reason for a status plugin to duplicate refresh. [OpenCode refresh and persistence](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/plugin/openai/codex.ts#L355-L388)
- Requirement: decoded claims are untrusted presentation metadata. They must not select an endpoint, grant capability, or be logged. Email display should be deliberate UI output, never failure detail.

### GitHub Copilot

- The baseline performs no decode and no refresh. It accepts only OpenCode `type: oauth`, uses `access` first and `refresh` as fallback, and lets `401`/`403` trigger re-login guidance.
- OpenCode's current device flow receives one `access_token`, duplicates it into both fields, and sets `expires: 0`. No automatic refresh semantics are established by the reviewed source. [OpenCode stored result](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/plugin/github-copilot/copilot.ts#L280-L305)
- Requirement: do not infer expiry or refresh support. A rejection is an unavailable/revoked credential and must not cause token exchange, database mutation, or fallback to other GitHub credentials.

### OpenCode Console / Zen

- The baseline treats a token expiring within 60 seconds as stale. OpenCode's own account service uses a five-minute eager-refresh threshold. [OpenCode threshold](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/account.ts#L137-L142)
- It posts the stored refresh token and `client_id: opencode-cli`, accepts unvalidated JSON as replacement access token, refresh token, and lifetime, then writes all three directly to SQLite before making usage calls.
- OpenCode's official source performs the same protocol but runtime-validates the response and persists through `AccountRepo`. [refresh schema and request](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/account.ts#L82-L86) [refresh implementation](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/account.ts#L216-L246)
- Requirement: the public plugin must not refresh through SQL. If OpenCode cannot provide a fresh token through a supported API, report Zen unavailable and direct the user to `opencode console login`; do not risk account-state mutation for observability.

## Outbound endpoint and header inventory

All current requests use an 8-second abort timeout. The baseline has no retry loop, does not intentionally log request or response data, and surfaces only status/status text or a generic JSON parse error. These are useful properties but do not make private endpoints stable.

| Provider / purpose | Method and endpoint | Credential-bearing headers/body | Evidence and status | Main risks |
| --- | --- | --- | --- | --- |
| Codex rate limits | `GET https://chatgpt.com/backend-api/wham/usage` | `Authorization: Bearer <OpenCode openai.access>`; optional `ChatGPT-Account-Id: <accountId>`; `User-Agent: codex-cli` | Exact path and headers are in OpenAI's Codex source. No public API reference or compatibility policy for this ChatGPT backend route was found. **Provider-owned, private/undocumented, mutable.** [endpoint](https://github.com/openai/codex/blob/56395bddaf26eb2829387ca6a417bf9128e5b239/codex-rs/backend-client/src/client/rate_limit_resets.rs) [headers](https://github.com/openai/codex/blob/56395bddaf26eb2829387ca6a417bf9128e5b239/codex-rs/backend-client/src/client.rs) | Full bearer secret leaves the machine; account ID is sensitive metadata. Payload fields/windows can drift. `User-Agent: codex-cli` identifies the request as the provider's client rather than this plugin. |
| Console token refresh | `POST <account.url>/auth/device/token` | JSON body containing `grant_type: refresh_token`, the refresh token, and `client_id: opencode-cli`; `Content-Type: application/json` | Exact protocol appears in OpenCode account source. It is an internal Console account interface, not documented for third-party plugins. **Provider-owned source, private integration contract.** | Highest-impact call: sends refresh credential to a state-derived origin and returns state that must be persisted atomically by its owner. Custom origin, redirects, malformed response, timeout after server success, and write failure all require fail-closed handling. |
| Console user | `GET <account.url>/api/user` | `Authorization: Bearer <access>` and baseline also sends `x-org-id: <active org>` | OpenCode source uses this endpoint with bearer auth, but does not send `x-org-id` for this call. **Provider-owned source; extra baseline header unnecessary by reviewed evidence.** [source](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/account.ts#L298-L309) | Exposes access token plus org identifier. Returns user ID and email. Extra identifier should not be sent where not required. |
| Console orgs | `GET <account.url>/api/orgs` | `Authorization: Bearer <access>` and baseline also sends `x-org-id: <active org>` | OpenCode source uses this endpoint with bearer auth, but does not send `x-org-id`. **Provider-owned source; extra baseline header unnecessary by reviewed evidence.** [source](https://github.com/anomalyco/opencode/blob/b95fe7b2d74b9f17d5573dfc783d1bf8f9e3f298/packages/opencode/src/account/account.ts#L285-L296) | Exposes access token and active org; response enumerates organizations. Baseline degrades org-name failure to `unknown`, which is safe but loses reason. |
| Zen 24-hour usage | `GET <account.url>/api/usage/summary?range=24h&userId=<user id>` | `Authorization: Bearer <access>`; `x-org-id: <active org>` | Exact route/query/response were found in the baseline but not in reviewed public Zen docs or current OpenCode client source. **Private/undocumented; intended external support unknown.** | Sends bearer plus two account identifiers. Query strings are commonly retained by intermediaries, so user ID must be treated as sensitive telemetry. Response schema and cost units can change. |
| Zen 30-day usage | `GET <account.url>/api/usage/summary?range=30d&userId=<user id>` | Same as 24-hour call | Same classification as 24-hour call. | Same risks; requests run concurrently, increasing partial-failure combinations. |
| Copilot personal quota | `GET https://api.github.com/copilot_internal/user` | `Authorization: Bearer <OpenCode GitHub OAuth token>`; `Accept: application/vnd.github+json`; `X-GitHub-Api-Version: 2022-11-28`; `User-Agent: opencode/status-codex` | GitHub's allowlist names `api.github.com/copilot_internal/*` for user management, but its public REST docs do not define this route or quota response. **Provider-recognized namespace, private/undocumented exact interface.** [allowlist](https://docs.github.com/en/copilot/reference/copilot-allowlist-reference#github-public-urls) [public REST alternative scope](https://docs.github.com/en/rest/copilot/copilot-user-management) | Private response fields (`copilot_plan`, SKU, reset dates, `quota_snapshots.premium_interactions`) can drift. The requested REST version does not establish a versioned contract for an undocumented route. Public org metrics require organization authorization and do not document an equivalent personal quota response. |

No public, documented endpoint equivalent was found for personal Codex windows, personal Copilot premium-request balance, or the baseline Zen summary. This is an absence-of-evidence finding limited to the reviewed primary sources, not proof that no supported interface exists.

## Mutation and secret-leakage analysis

### Direct Console database update

The direct `UPDATE account` is the one behavior that can damage state rather than merely fail to display it.

- It couples the plugin to internal table/column names and the singleton `account_state.id = 1` convention.
- It assumes the production database is always `opencode.db`, contrary to OpenCode's channel and `OPENCODE_DB` selection logic.
- It bypasses OpenCode's runtime response decoder and account repository.
- It can race another OpenCode process that refreshes the same account. There is no compare-and-swap on the old refresh token or expiry.
- It ignores the affected-row count.
- A refresh server success followed by local write failure creates an ambiguous state. The plugin discards the replacement and refuses to continue; whether the old refresh credential remains valid is provider behavior not established by reviewed sources.
- A public status command should have no credential mutation blast radius. The factual inventory therefore supports a hard no-direct-SQL constraint for the policy ticket.

### State-derived Console origin

OpenCode supports custom Console login URLs, so hard-coding only the official host would remove a real capability. Conversely, blindly trusting the stored URL means a modified database can direct access and refresh tokens to another host.

Required trust behavior:

- Treat `https://console.opencode.ai` as the known default, not as proof that every stored URL is trusted.
- Require HTTPS for remote origins unless an explicitly configured local/self-hosted exception is part of the eventual policy.
- Make custom-origin use visible and opt-in; bind approval to the normalized origin.
- Reject embedded credentials, unexpected schemes, and origin-changing redirects. The reviewed baseline does not set an explicit redirect policy, so exact runtime credential forwarding behavior is not relied upon here.
- Never fall back from a failed custom origin to the official origin with the same token.

### Secret minimization

The following values require redaction from logs, errors, telemetry, snapshots, fixtures, issue reports, and crash output:

- OpenAI, GitHub, and Console access/refresh tokens; API keys; complete `auth.json` records; SQL rows.
- `Authorization` and `ChatGPT-Account-Id` header values; refresh request bodies.
- Account, organization, workspace, and user IDs. These are not all bearer secrets, but they are sensitive account identifiers.
- Emails by default outside the intentional local UI account label.
- Query strings containing `userId`.

Minimize token lifetime in application objects, never interpolate a token into a URL, never include request options in an exception, and never expose raw provider response bodies. JavaScript cannot guarantee memory zeroization; the enforceable requirement is to avoid unnecessary copies and retention.

## Failure and redaction requirements

Each provider must fail independently. A Console schema/lock error must not suppress Codex or Copilot, and malformed one-provider auth must not make a different provider appear disconnected.

Provider-facing failures should map to bounded, sanitized categories:

| Condition | Required result |
| --- | --- |
| Missing credential/account | Provider omitted or shown as not connected; no path, file contents, or other configured providers disclosed. |
| Wrong auth type (for example OpenAI API key) | Explain that this usage view requires subscription OAuth; never display the key or record. |
| Expired/missing access token | Ask the owner to refresh/re-login. Do not independently consume a refresh token unless a supported owner API performs the whole operation. |
| `401`/`403` | Credential rejected or insufficient access; re-login guidance. Do not include response body/status text supplied by a private/custom service. |
| `404`/`410` or response schema mismatch | Endpoint unavailable/incompatible; classify as provider integration drift, not bad credentials. Preserve other provider results. |
| `429` | Rate limited; do not retry aggressively and do not reauthenticate. Use a provider reset/retry value only if documented and validated. |
| `5xx`, timeout, DNS, TLS, proxy | Temporary provider/network failure. Sanitize library exception text before UI or telemetry because it may contain URLs and identifiers. |
| Custom Console origin not approved or redirect changes origin | Refuse to send credentials and identify only the origin requiring approval. |
| Database missing, wrong channel, locked, migrated, or malformed | Zen unavailable. Never search other databases, run migrations, alter pragmas, or write repair SQL. |
| Partial Zen calls | Preserve already safe data only if its account/org association is validated; otherwise show one sanitized Zen failure. Never combine user data from mismatched calls. |

The baseline already avoids logging and does not surface provider response bodies. It should not rely on `Error.message` or provider-controlled `statusText` remaining secret-free. The public contract should generate its own messages from validated status/category data.

## Unknowns and unsupported conclusions

- No public stability/deprecation commitment was found for `chatgpt.com/backend-api/wham/usage`, despite its use in OpenAI's Codex source.
- No public response contract was found for `api.github.com/copilot_internal/user`; exact token scopes needed beyond the current OpenCode login flow are unknown.
- No public contract or current OpenCode source call was found for `/api/usage/summary` with `range` and `userId`; its intended external audience and compatibility are unknown.
- Whether Console refresh tokens are single-use/rotating in every deployment is unknown. The response includes a replacement refresh token, so code must handle rotation safely without claiming it always occurs.
- Whether OpenCode exposes a supported third-party plugin API that returns only a named provider credential and a fresh Console token/account snapshot was not established by the reviewed plugin docs. Bundled OpenCode code has internal auth/account services, but internal availability is not a public extension guarantee.
- The retention and server-side logging behavior of these private account endpoints is not specified by the reviewed interface sources. No claim is made about it.

## Input to the support-policy decision

The inventory supports these constraints for the follow-up [Choose credential and endpoint support policy](https://github.com/martinvidovic/opencode-limits/issues/6):

- Make private endpoint support explicit, best-effort, independently disableable, and covered by schema-drift failure states.
- Keep usage providers observational: no direct writes to `auth.json`, SQLite, keychains, or environment state.
- Obtain fresh credentials through OpenCode-owned interfaces or require re-login; do not implement parallel refresh ownership.
- Scope credential access per provider and disclose every outbound origin/header class without exposing values.
- Treat custom Console origins as explicit trust decisions.
- Guarantee no raw secret, response body, auth record, SQL row, or sensitive identifier appears in logs/errors/telemetry.

## Newly surfaced ticket or fog suggestions

1. **Fog: supported OpenCode credential/account accessor.** Confirm with OpenCode maintainers whether third-party plugins have a documented API for a named provider credential and a fresh Console account token. If not, open an upstream-facing design ticket rather than standardizing raw file/SQLite coupling.
2. **Ticket: private endpoint compatibility probes.** Add contract fixtures and drift handling for the three private usage schemas without recording live traffic or credentials; define which status/schema changes disable only one adapter.
3. **Fog: custom Console origin policy.** Decide how users approve self-hosted origins, whether non-HTTPS localhost is permitted, and how origin-changing redirects are rejected.
4. **Ticket: secret-safe diagnostics.** Specify and test a provider-neutral error taxonomy and redaction boundary before any network adapter is implemented.
5. **Fog: documented replacements.** Recheck provider primary sources before each release for supported personal-usage endpoints; public GitHub organization metrics are not currently a drop-in replacement for a user's premium-request balance.
