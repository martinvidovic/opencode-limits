# OpenCode Limits

This context describes how opencode-limits discovers and presents usage limits for accounts connected to OpenCode.

## Language

**Provider Adapter**:
An in-repository integration for one usage provider, contributed upstream and shipped as part of opencode-limits. It receives provider-scoped capabilities and returns one active account result through a single load operation; it is not an independently installed runtime extension.
_Avoid_: Provider plugin, provider package

**Usage Snapshot**:
A successful Provider Adapter result for one active account. It contains display-only account context, quota meters, and period summaries without provider-specific rendering.
_Avoid_: Provider response, display rows

**Display-only Account Context**:
Account email or login plus plan or organization context that may appear in the intentional local popup but must never appear in errors, logs, telemetry, diagnostics, or fixtures derived from live data. It excludes credentials, authorization data, and provider identifiers that are never displayable.
_Avoid_: Safe account data, public account data

**Quota Meter**:
A named allowance represented as a fraction used, bounded amount, remaining balance, or unlimited value, optionally with a reset time.
_Avoid_: Progress bar, quota row

**Period Summary**:
A named reporting period with structured usage totals such as cost, requests, or tokens.
_Avoid_: Usage row, Zen row

**Provider Load Result**:
The outcome of loading usage for one connected provider. A successful result contains one Usage Snapshot; a failed result contains a bounded Provider Failure and may retain display-only account context.
_Avoid_: Provider response, fetch result

**Provider Failure**:
A provider-neutral, secret-safe reason that a connected provider could not produce a Usage Snapshot. It uses the shared failure taxonomy rather than provider-controlled text or raw exceptions.
_Avoid_: Error message, provider error

**Quality Gate**:
The technical checks that every published artifact must pass, whether prerelease or stable.
_Avoid_: Prerelease checks, stable checks

**Promotion Gate**:
The validation and release evidence required in addition to the Quality Gate before promoting a prerelease artifact to stable.
_Avoid_: Stable quality checks
