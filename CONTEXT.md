# OpenCode Limits

This context describes how opencode-limits discovers and presents usage limits for accounts connected to OpenCode.

## Language

**Provider Adapter**:
An in-repository integration for one usage provider, contributed upstream and shipped as part of opencode-limits. It receives provider-scoped capabilities and returns one active account result through a single load operation; it is not an independently installed runtime extension.
_Avoid_: Provider plugin, provider package

**Usage Snapshot**:
A successful Provider Adapter result for one active account. It contains display-only account context, quota meters, and period summaries without provider-specific rendering.
_Avoid_: Provider response, display rows

**Quota Meter**:
A named allowance represented as a fraction used, bounded amount, remaining balance, or unlimited value, optionally with a reset time.
_Avoid_: Progress bar, quota row

**Period Summary**:
A named reporting period with structured usage totals such as cost, requests, or tokens.
_Avoid_: Usage row, Zen row
