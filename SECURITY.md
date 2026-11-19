# Security policy

purgeit deletes files, so a bug that deletes the wrong thing is a security issue.

## Reporting

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/nandan-varma/purgeit/security/advisories/new) rather than a public issue. Include the output of `purgeit explain <path>` and `purgeit scan --format json` where relevant, your OS and Node version, and (if you can) a minimal directory tree that reproduces it.

You can expect an acknowledgement within a few days. Fixes for anything that can delete data it should not are released as soon as they are verified.

## What counts

- Deleting, or offering to delete, something that is not regenerable build output.
- Any way to make `clean` delete outside the directories you scanned (symlinks, `..` segments, races).
- Bypassing the protection checks (nested repositories, deploy keypairs, git-tracked files) or the recent-activity guard.
- Tampering with `plan.json` input that leads to deletion the guards should have refused.

## What to expect from purgeit

The design, and the checks run at the moment of deletion, are described in [the safety model](https://purgeit.nandan.fyi/docs/concepts/safety-model). purgeit makes no network requests and sends no telemetry. Releases are published to npm with signed provenance (`npm audit signatures`), and release binaries ship with a `SHA256SUMS` file.

## Supported versions

Only the latest release receives fixes.
