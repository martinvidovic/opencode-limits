# Domain Docs

This repository uses a single-context domain-doc layout.

## Before exploring

Read these files when they exist:

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `docs/adr/`.

Proceed silently when they do not exist. The domain-modeling skill creates them lazily when terminology or durable architectural decisions are resolved.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

`CONTEXT.md` is a glossary, not a specification or implementation guide. Use its canonical terms in issue titles, design discussions, code, and tests. Surface any proposed change that contradicts an existing ADR instead of silently overriding it.
