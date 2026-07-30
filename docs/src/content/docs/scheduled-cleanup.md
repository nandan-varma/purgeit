---
title: Scheduled cleanup
description: Automate recurring cleanup with cron, launchd, systemd timers, or cloud schedulers — no daemon required.
---

purgeit doesn't ship a background daemon or menu-bar app — that's a different runtime entirely (a native app with its own install/update story) from a terminal CLI, and would mean shipping and maintaining a second product. Instead, `--min-age`/`--max-age` plus the existing headless flags (`--delete --yes`) are enough to script "delete anything untouched for N days" as a recurring job using whatever scheduler your OS or cloud provider already gives you.

**Always dry-run a new schedule manually before wiring it into cron** — a scripted `--delete --yes` has no human in the loop to catch a misconfigured `--directory`/`--tag`.

## Local: cron, launchd, or a systemd timer

### cron (Linux/macOS)

Delete `node_modules`/`dist`/etc. untouched for 30+ days, once a week:

```txt
0 3 * * 0 npx purgeit --directory ~/dev --min-age 30d --delete --yes --headless >> ~/purgeit-cleanup.log 2>&1
```

### launchd (macOS)

A user LaunchAgent (`~/Library/LaunchAgents/dev.purgeit.cleanup.plist`) achieves the same without cron:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.purgeit.cleanup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/npx</string>
    <string>purgeit</string>
    <string>--directory</string><string>/Users/you/dev</string>
    <string>--min-age</string><string>30d</string>
    <string>--delete</string><string>--yes</string><string>--headless</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>0</integer>
    <key>Hour</key><integer>3</integer>
  </dict>
  <key>StandardOutPath</key><string>/tmp/purgeit-cleanup.log</string>
  <key>StandardErrorPath</key><string>/tmp/purgeit-cleanup.log</string>
</dict>
</plist>
```

Load it with `launchctl load ~/Library/LaunchAgents/dev.purgeit.cleanup.plist`.

### systemd timer (Linux)

`~/.config/systemd/user/purgeit-cleanup.service`:

```ini
[Service]
ExecStart=npx purgeit --directory %h/dev --min-age 30d --delete --yes --headless
```

`~/.config/systemd/user/purgeit-cleanup.timer`:

```ini
[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl --user enable --now purgeit-cleanup.timer`.

## Cloud: EventBridge Scheduler / Cloud Scheduler

The [cloud provider](/cloud/) headless path scripts the same way — schedule a Lambda/Cloud Function (or a scheduled task on any always-on host) that shells out to the same command:

```bash
purgeit --provider aws --tag env=dev --min-age 30d --delete --yes
```

```bash
purgeit --provider gcp --gcp-project my-project --tag env=dev --min-age 30d --delete --yes
```

An EventBridge Scheduler rule (AWS) or Cloud Scheduler job (GCP) triggering a small container/function that runs one of these on a weekly cadence is enough — purgeit itself doesn't need to be "always on" anywhere. Give the invoking role/service-account only the minimum needed permissions (e.g. AWS: `cloudformation:DescribeStacks`, `cloudformation:DeleteStack`, and `ce:GetCostAndUsage` if using `--with-cost`; GCP: `compute.instances.list`/`delete`, `container.clusters.list`/`delete`).
