# purgeit — cloud cleanup (AWS & GCP)

Beyond local build artifacts, purgeit can find and delete forgotten cloud dev environments —
tagged AWS CloudFormation stacks, labeled GCP Compute Engine instances and GKE clusters. This is a
separate, stricter mode: always headless (no TUI), always gated on tag/label filters (there is no
"always safe" cloud resource), and a deleted cloud resource is frequently **not** regenerable the
way `node_modules` is — treat every cloud `--delete` with more caution than a local one.

## Golden rule for agents (cloud-specific)

Everything in the core skill's golden rule applies, plus: **cloud resources cost real money and
are often not regenerable.** Always run with `--json --dry-run` first, show the user the exact
resources (id, type, region, cost if available) before ever suggesting `--delete`, and never
supply `--yes` on an agent's own initiative for a cloud deletion.

## CLI usage

```bash
npx purgeit --provider aws --tag env=dev --json --dry-run                 # preview only
npx purgeit --provider aws --tag env=dev --with-cost --json --dry-run     # + billed cost (last 30 days)
npx purgeit --provider gcp --gcp-project my-project --tag env=dev --json --dry-run
npx purgeit --provider aws --tag env=dev --delete --yes                   # only after human review
```

- `--provider aws|gcp` switches the resource domain; local-only flags (`--full`, `--project`,
  `--depth`, `--targets`, `--min-size`, `--exclude`, `--no-gated`, `--tui`, an explicit directory)
  are rejected outright when set.
- `--tag <key=value>` is repeatable and uses **AND semantics** — every tag/label given must be
  present on a resource for it to match. purgeit refuses to run with zero tags configured (via
  `--tag`, config's `cloud.tagKey`/`cloud.tagValue`, or the built-in `purgeit-managed=true`
  default) rather than treating "no filter" as "match everything."
- `--gcp-project <id>` is required for GCP (no reliable implicit default project). AWS instead
  takes `--region`/`--aws-profile`; GCP has no `--region` flag because discovery always covers
  every zone/location in the project in one call.
- `--with-cost` (AWS only) fetches **real billed** cost from the last 30 days via one batched Cost
  Explorer call. GCP resources always report `cost: null` — GCP has no per-resource cost API, so
  purgeit doesn't guess; `--with-cost` is rejected outright for `--provider gcp`.
- `--json` output per entry: `{ id, provider, resourceType, label, project, region, tags,
  createdAt, cost }`. `resourceType` is `cloudformation-stack` (AWS) or `compute-instance` /
  `gke-cluster` (GCP). `cost` is `{ amountUsd, basis: 'billed' | 'list-price-estimate' }` or `null`.
- `--min-age`/`--max-age` filter on `createdAt`, same as local mtime filtering.

## Credentials

purgeit never accepts, stores, or transmits credentials itself — it always defers to each
provider's own default credential resolution (AWS's standard credential chain / `AWS_PROFILE` via
`--aws-profile`; GCP's Application Default Credentials). Don't ask a user for raw keys/secrets to
pass to purgeit; if discovery fails with a credentials error, the fix is on the AWS/GCP CLI side
(`aws configure`, `gcloud auth application-default login`), not a purgeit flag.

## What NOT to do (cloud-specific)

- Don't suggest `--delete --yes` for a cloud resource without the user having seen the specific
  `--json --dry-run` output for that exact tag filter first — this is a stronger bar than local
  cleanup, not the same one.
- Don't treat a GCP `cost: null` as "free" — it means "unknown," not "zero."
- Don't widen a tag filter (e.g. dropping a `--tag`) to "find more to clean" without the user
  explicitly asking for a broader match — a narrower, deliberate filter is the safety mechanism here.
