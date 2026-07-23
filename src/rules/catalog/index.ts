import { appleRules } from './apple.js';
import { dartFlutterRules } from './dart-flutter.js';
import { dotnetRules } from './dotnet.js';
import { elixirRules } from './elixir.js';
import { elmRules } from './elm.js';
import { haskellRules } from './haskell.js';
import { javaJvmRules } from './java-jvm.js';
import { javascriptRules } from './javascript.js';
import { pythonRules } from './python.js';
import { rubyRules } from './ruby.js';
import { rustRules } from './rust.js';
import { sharedRules } from './shared.js';
import type { RuleDefinition } from './types.js';
import { vcsRules } from './vcs.js';
import { zigRules } from './zig.js';

/**
 * The single source of truth for purgeit's default rules: every built-in
 * always-safe, gated, and prune-meta entry, each carrying the ecosystem
 * category/categories and a human-readable description alongside the
 * matching logic itself. `default-rules.ts` and `gate-conditions.ts` derive
 * the flat name lists and compiled `Gate` map the scan engine actually
 * consumes from this array — and it's also exported from the package's
 * public API so docs (or any other consumer) can render it directly instead
 * of hand-copying rule tables that drift from the source of truth.
 *
 * To add a new ecosystem: create `catalog/<ecosystem>.ts` exporting a
 * `readonly RuleDefinition[]`, add it to the spread below, and add its
 * `RuleCategory` to `types.ts` (label + display order) if it's new.
 */
export const RULE_CATALOG: readonly RuleDefinition[] = [
  ...javascriptRules,
  ...pythonRules,
  ...rustRules,
  ...appleRules,
  ...dotnetRules,
  ...javaJvmRules,
  ...sharedRules,
  ...rubyRules,
  ...dartFlutterRules,
  ...elixirRules,
  ...haskellRules,
  ...elmRules,
  ...zigRules,
  ...vcsRules,
];

export * from './types.js';
