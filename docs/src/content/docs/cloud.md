---
title: Cloud cleanup (AWS & GCP)
description: Find and delete forgotten cloud dev environments — tagged CloudFormation stacks and labeled Compute Engine/GKE resources.
---

Beyond local build artifacts, purgeit can discover and delete forgotten cloud dev environments — tagged CloudFormation stacks on AWS, and labeled Compute Engine instances or GKE clusters on GCP. This is a separate resource domain from the local filesystem scanner: it's always headless (no TUI), always tag/label-gated (nothing "always safe" exists for cloud resources), and the SDKs are optional — a plain `npx purgeit` for local cleanup never downloads or loads either provider's client library.

## Setup

Cloud support needs the relevant SDK installed alongside purgeit:

```bash
# AWS
npm install @aws-sdk/client-cloudformation @aws-sdk/client-cost-explorer

# GCP
npm install @google-cloud/compute @google-cloud/container
```

If a package is missing, purgeit fails with a clear `npm install ...` hint rather than a raw module-resolution error.

### Credentials

purgeit never accepts or stores credentials itself — it always defers to each provider's own default credential resolution:

- **AWS**: the SDK's standard credential chain (`~/.aws/credentials`, environment variables, an assumed role, etc.). `--aws-profile <name>` sets `AWS_PROFILE` so the chain picks up that profile; `--region <region>` selects the region (CloudFormation has no single "list stacks in every region" call, so one region is scanned per invocation).
- **GCP**: Application Default Credentials (`gcloud auth application-default login`, or `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service account key). `--gcp-project <id>` is required — GCP has no reliable implicit default project for this. Unlike AWS, GCP discovery always covers every zone/location in the project in one call, so there's no `--region` flag for it.

## Tag/label filters

Discovery only ever matches resources carrying every one of the configured tag/label key-value pairs (AND semantics) — there is no "match everything" mode, by design. If no tag is configured at all, purgeit refuses to run rather than silently treating that as "no filter."

```bash
purgeit --provider aws --tag env=dev
purgeit --provider aws --tag env=dev --tag team=platform   # both must match
purgeit --provider gcp --gcp-project my-project --tag purgeit-managed=true
```

Without `--tag`, purgeit falls back to `purgeit.config`'s `cloud.tagKey`/`cloud.tagValue`, then finally to the built-in default `purgeit-managed=true` (a valid tag key on AWS and a valid label key on GCP — lowercase, no colons).

## What gets discovered

| Provider | Resource | Discovery |
| --- | --- | --- |
| AWS | CloudFormation stacks | Paginated `DescribeStacks`, one region per call |
| GCP | Compute Engine instances | `aggregatedList` — every zone in the project, one call |
| GCP | GKE clusters | `listClusters` with `locations/-` — every location, one call |

AWS targets CloudFormation stacks specifically because that's the common unit of a "dev environment." GCP has no equivalent stack concept in common use (Deployment Manager is deprecated), so discovery targets the actual costly leftover resources — VM instances and clusters — directly.

## Cost estimates

`--with-cost` (AWS only this release) fetches the last 30 days' **billed** cost in one batched Cost Explorer call, grouped by the `aws:cloudformation:stack-name` cost allocation tag — real spend, not an estimate. It's opt-in because it's an extra API call with its own latency and IAM permissions (`ce:GetCostAndUsage`).

GCP cost estimation isn't included yet: unlike AWS, GCP has no per-resource cost API — a real estimate would mean paginating tens of thousands of Cloud Billing Catalog SKUs and pattern-matching their description strings, which isn't something that can be verified without a live GCP billing account. GCP resources always report `cost: null`, and `--with-cost` is rejected outright with `--provider gcp` rather than silently doing nothing.

## Deleting

The same safety model as local cleanup applies: a dry-run-style preview first, then `--delete` (confirming unless `--yes`). Cloud deletions get one extra layer of caution in the confirm prompt's wording — a deleted CloudFormation stack or GKE cluster is frequently **not** regenerable the way a `node_modules` folder is.

```bash
purgeit --provider aws --tag env=dev --with-cost              # preview with cost
purgeit --provider aws --tag env=dev --delete                 # confirms, then deletes
purgeit --provider gcp --gcp-project my-project --tag env=dev --delete --yes --dry-run
```

`--min-age`/`--max-age` apply here too, filtering on each resource's creation time — useful for "only stacks untouched for 30+ days":

```bash
purgeit --provider aws --tag env=dev --min-age 30d --delete
```

See [Scheduled cleanup](/scheduled-cleanup/) for running this on a recurring basis via cron/EventBridge/Cloud Scheduler instead of a bespoke daemon.
