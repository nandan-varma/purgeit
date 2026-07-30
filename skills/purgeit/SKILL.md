---
name: purgeit
description: Find and safely delete regenerable dev build artifacts (node_modules, dist, target, Pods, ...) and forgotten AWS/GCP dev environments, via purgeit's CLI or library API.
---

# purgeit

This file is a discovery stub, not the usage guide. Before running any `purgeit` command, load
the actual guidance from the CLI:

```bash
npx purgeit skills get core             # start here — safety rules, CLI and library usage
npx purgeit skills get core --full      # include the full CLI flag reference and library API list
```

The CLI serves skill content that always matches the installed version, so instructions never go
stale between releases.

## Specialized skills

Load this when the task involves AWS/GCP, not just local directories:

```bash
npx purgeit skills get cloud   # cloud cleanup — tag filters, cost caveats, stronger delete safety
```

Run `npx purgeit skills list` to see everything available on the installed version.
