---
title: Scheduled cleanup
description: Run purgeit unattended with cron, launchd or CI.
---

Unattended runs should be conservative and leave a trail.

```bash
# every Sunday: anything untouched for 30+ days and larger than 100 MB
purgeit clean ~/dev --min-age 30d --min-size 100MB --yes
```

`clean` already skips recent activity (default 7 days), re-verifies each path, logs to `purgeit history`, and exits `1` if anything was skipped or failed, so a scheduler can notice.

## Review first, then apply

For anything you want a human to approve:

```bash
purgeit scan ~/dev --format json > plan.json   # edit: remove entries you want to keep
purgeit clean --plan plan.json --yes
```

The plan only *proposes*: each entry is re-checked against the rules, protection and "changed since the scan" before it is deleted.

## cron

```text
0 3 * * 0  /usr/local/bin/purgeit clean ~/dev --min-age 30d --yes >> ~/purgeit.log 2>&1
```
