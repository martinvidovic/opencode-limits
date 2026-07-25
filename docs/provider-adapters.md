# Provider Adapters

A Provider Adapter is an in-repository integration for one usage provider. It
is shipped with opencode-limits, not installed as a runtime extension. Propose
an adapter before implementation through the public
[Provider Adapter proposal](https://github.com/martinvidovic/opencode-limits/issues/new?template=provider-adapter.yml).
Maintainer acceptance authorizes investigation, not merge.

## Contract

An adapter pairs a typed, provider-scoped credential reader with one `load`
operation. Register it in deterministic display order with a matching OpenCode
provider ID. Its load operation must use the core `SafeRequester`, validate
unknown responses, and normalize all successful stages into one `UsageSnapshot`
or one bounded `ProviderFailure`.

- Keep credential types, origins, endpoints, and provider response shapes in
  the provider directory.
- Read credentials only. Do not refresh, mutate, log, or expose them.
- Use only the provider's fixed expected origin and the requester's redirect,
  size, cancellation, and error policy.
- Preserve lifecycle cancellation and let each provider failure remain isolated.
- Return Display-only Account Context only for intentional popup rendering;
  never include it in errors, logs, telemetry, diagnostics, or fixtures.
- Do not add provider-specific rendering or import provider payload types into
  `src/core`.

The executable references are the smallest shipped slice:
`src/providers/codex/registration.ts`, its typed credential reader and adapter,
and `test/providers/codex*.test.ts`. Canonical shared interfaces live in
`src/core/model.ts`; orchestration lives in `src/core/load-limits.ts`.

## Proposal and implementation

The proposal must state the OpenCode provider IDs, account states, visible
Quota Meters and Period Summaries, Display-only Account Context, credential
source, bound origins, request stages, failure mappings, synthetic test plan,
and sanitized live-validation plan. Never put credentials, raw auth records,
provider captures, account identities, headers, or query data in the proposal.

An accepted pull request is one vertical slice: registration, credential
reader, adapter, synthetic tests, supported-provider documentation, changelog
entry, and text-only live-validation evidence. Tests use minimal hand-authored
fixtures with obvious leak canaries and literal expected normalized values.
Do not commit live captures, mock private helpers, or add a fictional template
adapter.

Run `npm run check` before requesting review. The review verifies provider
isolation, registry order, cancellation, response validation, redaction,
documentation, and maintenance fit. After merge, the project owns the adapter
under its best-effort support policy; contributors have no ongoing obligation
or approval right.
