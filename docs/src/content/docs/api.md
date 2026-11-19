---
title: Library API
description: Use purgeit's scanner and cleaner from code.
---

Everything the CLI does is a plain async-iterator API with no UI dependency. ESM only, Node 22+.

```ts
import { createRuleSet, scan, scanAll, clean, loadConfig } from 'purgeit';

const { config } = await loadConfig({ cwd: process.cwd() });
const rules = createRuleSet(config);

// stream while the scan runs
for await (const event of scan(['/Users/me/dev'], { rules, minAge: 7 * 86_400_000 })) {
  if (event.type === 'entry') console.log(event.entry.rule.name, event.entry.bytes, event.entry.path);
}

// or collect
const { entries, summary } = await scanAll(['/Users/me/dev'], { rules });

// delete, re-verifying every path
const targets = entries.filter((e) => !e.protection).map((e) => ({
  path: e.path, bytes: e.bytes, unchangedSince: e.lastActive,
}));
for await (const event of clean(targets, { rules, roots: ['/Users/me/dev'], idleFor: 7 * 86_400_000 })) {
  if (event.type === 'refused') console.log('skipped', event.path, event.refusal.message);
}
```

## scan(roots, options)

Yields `found` (a rule claimed a path), then `entry` (measured) or `dropped` (`empty`, `too-small`, `too-recent`, `unreadable`), and `done` with a summary. Options: `rules`, `signal`, `depth`, `exclude`, `minBytes`, `minAge` (ms), `includeEmpty`, `home`, `io`.

An `Entry` has `path`, `root`, `project`, `rule`, `evidence`, `bytes`, `files`, `lastActive`, `protection`.

## clean(targets, options)

Yields `start`, `deleted`, `refused` (with a `Refusal` code), `failed`, `warning`, and `done`. Options: `rules`, `roots` (required), `idleFor`, `dryRun`, `concurrency`, `historyFile`, `signal`. History is only written when you pass `historyFile`.

## Rules and config

`RULE_CATALOG`, `createRuleSet(config)`, `restrictRuleSet`, `onlySafeRules`, `loadConfig`, `ConfigSchema`, `defineConfig`. Lower level: `measure`, `findProtection`, `discoverRoots`, `readHistory`.
