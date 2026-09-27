# Changelog

Notable changes to opencode-limits are recorded here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Semantic
Versioning.

## [0.1.1-rc.1] - 2026-09-16

### Fixed

- Correct the OpenCode Zen micro-cent conversion, which displayed every usage
  cost ten times too high — $28.70 where the Zen Console reported $2.87.
- Pad period columns so the `|` dividers align across a provider's period rows
  when cell widths differ, such as OpenCode Zen's Today and calendar-month rows.

## [Unreleased]

### Changed

- **Breaking:** target OpenCode v2 only. The package now exports a v2 server
  plugin (`.`), CLI plugin (`./tui`), and RPC contract (`./rpc`); the v1
  `server()`/`tui()` implementation is removed. Configure it under `plugins`,
  with options in the object form.
- Resolve Codex credentials from the active OpenAI integration connection on
  the server, accepting only ChatGPT OAuth logins (`chatgpt-browser` or
  `chatgpt-headless`); any other method reports `unsupported-auth` before a
  request. The CLI receives only displayable results over the
  `opencode-limits` RPC, and `showAccountContext: false` removes account
  context before it leaves the server.

### Removed

- **Breaking:** OpenCode Zen and GitHub Copilot usage are not shown until their
  v2 credential sources are restored; their v1 `auth.json` and database readers
  are removed.

## [0.1.0] - 2026-08-17

### Added

- Native `/limits` popup support for connected Codex, OpenCode Zen, and GitHub
  Copilot accounts.
- A global `showAccountContext` privacy option for hiding Display-only Account
  Context from the popup.
- Provider Adapter contribution guidance and a structured public proposal form.

### Fixed

- Accept compatible Codex quota windows when optional duration or reset metadata
  is absent, including null or missing primary/secondary windows.
- Match OpenCode Zen's account database, token refresh, organization, and usage
  request behavior.
- Accept GitHub Copilot credentials when either access or refresh tokens are
  present, ignoring zero expiry values that previously forced reconnect.
- Load Copilot `quota_snapshots` with GitHub API headers and render plan,
  premium, and chat rows.
- Match `/status-codex` presentation for Codex, OpenCode Zen, and Copilot:
  compact Account lines, progress bars with padded percent left, blank lines
  between reset windows, date-only resets, and Zen Today/Month period rows.

## [0.1.0-rc.2] - 2026-08-08

### Fixed

- Accept compatible Codex quota windows when optional duration or reset metadata
  is absent, including null or missing primary/secondary windows.
- Match OpenCode Zen's account database, token refresh, organization, and usage
  request behavior.
- Accept GitHub Copilot credentials when either access or refresh tokens are
  present, ignoring zero expiry values that previously forced reconnect.
- Load Copilot `quota_snapshots` with GitHub API headers and render plan,
  premium, and chat rows.
- Match `/status-codex` presentation for Codex, OpenCode Zen, and Copilot:
  compact Account lines, progress bars with padded percent left, blank lines
  between reset windows, date-only resets, and Zen Today/Month period rows.

## [0.1.0-rc.1] - 2026-07-25

### Added

- Native `/limits` popup support for connected Codex, OpenCode Zen, and GitHub
  Copilot accounts.
- A global `showAccountContext` privacy option for hiding Display-only Account
  Context from the popup.
- Provider Adapter contribution guidance and a structured public proposal form.
