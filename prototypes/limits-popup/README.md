# Limits popup prototype

> THROWAWAY PROTOTYPE: three native OpenCode `DialogAlert` structures for deciding the `/limits` popup hierarchy.

## Question

What native TUI popup structure makes Codex, OpenCode Zen, and GitHub Copilot clearer while preserving their current usage information, showing only connected providers, isolating failures, and leaving room for future Provider Adapters?

## Run

From this branch's repository root:

```sh
opencode
```

The project-local plugin is auto-discovered from `.opencode/plugins/limits-popup-prototype.ts`.

## Compare

- `/limits-prototype-a`: provider sections, optimized for account context and visual separation.
- `/limits-prototype-b`: compact ledger, optimized for density and quick comparison.
- `/limits-prototype-c`: quota-first scan, optimized for finding actionable limits across providers.

Run each command repeatedly to cycle through four fixture scenarios:

1. All three providers connected and available.
2. OpenCode Zen connected but unavailable while the other providers succeed.
3. OpenCode Zen disconnected and therefore omitted.
4. No connected providers.

The fixtures preserve the current `/status-codex` information without reading credentials, opening the OpenCode database, or making network requests.

## Evaluation prompts

1. Which variant makes the next constrained resource easiest to find?
2. Which variant keeps account identity clear without overpowering usage?
3. Is a provider failure noticeable without hiding successful providers?
4. Does the structure still make sense with one provider or five providers?
5. Which details should be combined from the losing variants?

## Verdict

Use **A: Provider sections** as the production popup hierarchy.

- Keep account identity directly under each provider heading.
- Keep each connected provider in stable registry order.
- Replace only a failed provider's usage rows with an inline safe failure; continue showing successful providers.
- Omit disconnected providers entirely.
- Keep quota reset times on separate lines for readability.
- Render Quota Meters and Period Summaries from shared structured values so future Provider Adapters add sections without provider-specific TUI code.

The compact ledger is too dense for heterogeneous provider data. The quota-first scan makes constrained resources easy to compare, but separates usage from the account and provider context needed to interpret it.
