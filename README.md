# opencode-limits

`opencode-limits` adds a native `/limits` popup to OpenCode for usage limits
from connected providers.

The planned first release will support Codex, OpenCode Zen, and GitHub Copilot.
This bootstrap tracer contains only a fixture provider; real provider
integrations arrive in subsequent vertical tracers.

## Development

Use Node.js 22.14.0 or newer, then run:

```sh
npm install
npm run check
```

The package publishes separate OpenCode v1 `./server` and `./tui` exports and
supports OpenCode `>=1.14.42 <2`.
