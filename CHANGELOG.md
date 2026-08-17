# Changelog

Notable changes to opencode-limits are recorded here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Semantic
Versioning.

## [Unreleased]

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
