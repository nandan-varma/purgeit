---
title: Built-in rules
description: The default artifact names and gated directories purgeit recognizes out of the box.
---

purgeit ships with a default ruleset ported from the original `CLEANUP.sh`. These rules are grouped into **always-safe** names (deleted anywhere they appear) and **gated** names (deleted only when a sibling manifest proves the directory is generated output).

## Always-safe rules

These directory names are matched wherever they appear in a project tree. Once found, the walker stops descending into them.

### JavaScript / TypeScript

| Name | What it is |
| --- | --- |
| `node_modules` | npm / yarn / pnpm dependencies |
| `.next` | Next.js build output |
| `.nuxt` | Nuxt build output |
| `.astro` | Astro build cache |
| `.docusaurus` | Docusaurus build cache |
| `.angular` | Angular build cache |
| `.svelte-kit` | SvelteKit build output |
| `dist` | Generic build output |
| `out` | Generic build output |
| `.turbo` | Turborepo cache |
| `.cache` | Generic framework cache |
| `.swc` | SWC compiler cache |
| `.vite` | Vite cache |
| `.parcel-cache` | Parcel cache |
| `.expo` | Expo cache |
| `storybook-static` | Storybook build output |
| `playwright-report` | Playwright report output |
| `test-results` | Playwright test results |
| `coverage` | Test coverage reports |
| `.nyc_output` | NYC coverage data |

### Rust

| Name | What it is |
| --- | --- |
| `target` | Cargo build output |

### Python

| Name | What it is |
| --- | --- |
| `__pycache__` | Python bytecode cache |
| `.venv` | Virtual environment |
| `venv` | Virtual environment |
| `.pytest_cache` | pytest cache |
| `.mypy_cache` | mypy cache |
| `.ruff_cache` | Ruff cache |
| `.tox` | tox environments |
| `.build` | Generic Python build output |

### Apple / Xcode

| Name | What it is |
| --- | --- |
| `DerivedData` | Xcode derived data |

## Gated rules

These names are too generic to trust blindly. purgeit only reports them when a sibling file in the same parent directory matches the gate.

| Name | Gate condition | Why it's gated |
| --- | --- | --- |
| `Pods` | A sibling `Podfile` exists | `Pods/` is only meaningful in CocoaPods projects |
| `build` | A sibling `Podfile`, `*.xcodeproj`, `*.xcworkspace`, `CMakeLists.txt`, `package.json`, `pyproject.toml`, `requirements.txt`, `build.gradle`, or `build.gradle.kts` exists | `build/` is used by many ecosystems |
| `.gradle` | A sibling `build.gradle`, `build.gradle.kts`, `settings.gradle`, or `settings.gradle.kts` exists | Gradle project metadata |
| `bin` | A sibling `*.csproj` or `*.sln` exists | .NET build output |
| `obj` | A sibling `*.csproj` or `*.sln` exists | .NET build output |

## Pruned metadata

These directories are treated like version-control metadata and are never descended into while scanning:

- `.git`
- `.hg`
- `.svn`

## Customizing the ruleset

You can extend, replace, or narrow these defaults with a [`purgeit.config.ts`](/configuration/).

Restrict the CLI to a subset of rules:

```bash
purgeit --targets node_modules,dist
```

Disable all gated rules and only match always-safe directories:

```bash
purgeit --no-gated
```

## Where the defaults come from

The built-in names are defined in `src/rules/default-rules.ts` and `src/rules/gate-conditions.ts`. They are merged into a `ResolvedRuleSet` at runtime via `defaultRuleSet()`.
