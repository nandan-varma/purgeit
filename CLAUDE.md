# CLAUDE.md

See `AGENTS.md` for commands and the rules of the road. Architecture in one screen:

```
src/rules/    catalog/ (data per ecosystem) · condition.ts (zod proof DSL) · rule-set.ts · match.ts
src/fs/       io.ts (listDir/statEntry) · measure.ts (size+files+lastActive, hardlink-aware) · activity.ts · protection.ts
src/scan/     scan() → found | entry | dropped | done · discoverRoots()
src/clean/    guard.ts inspect() · clean() → events · history.ts (JSONL)
src/config/   zod schema · c12 loader (→ purgeit.schema.json)
src/cli/      program.ts: run(argv, env) is pure and in-process testable · commands/* (lazy-loaded)
src/tui/      Ink app (alternate screen) · state.ts pure reducer incl. keymap
```

Data flow: `scan` streams measured entries → CLI renders or the TUI reducer collects → `clean` re-verifies each target and deletes.

Toolchain: Bun (install, scripts, `bun fmt`), oxlint (+type-aware via tsgolint), `tsgo` for typecheck, knip, React Doctor, publint + attw, lefthook; tests run on Node via vitest; build with tsdown. Node ≥22, ESM only. Releases are tag-triggered and publish with npm trusted publishing (OIDC), no stored token.

Gotchas: keep the shebang in `src/cli/main.ts` (tsdown preserves it and sets +x). Markdown is imported as text (`skills/purgeit/guide.md`) via tsdown's `loader` and a small plugin in `vitest.config.ts`. Ink tests: wait on rendered frames, not timers.
