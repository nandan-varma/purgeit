import {
  Bot,
  Gauge,
  Library,
  MonitorCog,
  ScanSearch,
  ShieldCheck,
  Terminal as TerminalIcon,
} from 'lucide-react';
import Link from 'next/link';

import { CopyCommand } from '@/components/copy-command';
import { Terminal } from '@/components/terminal';
import meta from '@/generated/meta.json';
import rules from '@/generated/rules.json';
import { repoUrl, tagline } from '@/lib/shared';

const features = [
  {
    icon: ShieldCheck,
    title: 'Safe by construction',
    body: 'Nothing is preselected. Every path is re-verified at the moment of deletion — rules, git, deploy keys, recent activity, symlink tricks.',
    href: '/docs/concepts/safety-model',
  },
  {
    icon: Gauge,
    title: 'Fast',
    body: 'One traversal measures size, file count and last activity — as fast as du, while also proving what is safe.',
    href: '/docs/concepts/how-it-works',
  },
  {
    icon: ScanSearch,
    title: 'Honest numbers',
    body: 'Sizes are space deleting would really free. Hardlinked files — pnpm’s store — are never double counted.',
    href: '/docs/concepts/how-it-works#how-sizes-are-counted',
  },
  {
    icon: MonitorCog,
    title: 'Projects, not folders',
    body: 'One row per project — worktrees folded in, dormant ones first, one key (R) to select them. Review, then delete.',
    href: '/docs/guides/interactive-ui',
  },
  {
    icon: TerminalIcon,
    title: 'Scriptable',
    body: 'JSON and NDJSON output, reviewable plans, dry runs and stable exit codes for cron and CI.',
    href: '/docs/guides/automation',
  },
  {
    icon: Bot,
    title: 'Built for AI agents',
    body: 'A guide versioned with the CLI, structured output, and every docs page available as Markdown.',
    href: '/docs/guides/ai-agents',
  },
];

const steps = [
  ['Scan', 'Rules claim directories. One pass measures size, files and last activity.'],
  ['Protect', 'Nested repos, deploy keys and git-tracked files are locked and can’t be selected.'],
  ['Review', 'Nothing preselected. See what, why, and how much — then confirm.'],
  [
    'Verify & delete',
    'Every path is re-checked right before it is removed. Unverifiable means refused.',
  ],
];

export default function HomePage() {
  const matchable = rules.rules.filter((rule) => rule.kind !== 'ignore').length;
  return (
    <main className="flex-1">
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-16 md:pt-24 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-6">
          <Link
            href="/docs/guides/getting-started"
            className="inline-flex items-center gap-2 rounded-full border bg-fd-card px-3 py-1 text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <span className="rounded-full bg-fd-primary px-1.5 py-0.5 font-mono text-[10px] text-fd-primary-foreground">
              v{meta.version}
            </span>
            Signed releases, trusted publishing →
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {tagline}
          </h1>
          <p className="max-w-xl text-lg text-fd-muted-foreground text-balance">
            purgeit finds <code className="font-mono text-base">node_modules</code>,{' '}
            <code className="font-mono text-base">target</code>,{' '}
            <code className="font-mono text-base">dist</code>,{' '}
            <code className="font-mono text-base">Pods</code> and {matchable - 4} more kinds of
            regenerable build output across all your projects — and deletes only what it can prove
            is safe.
          </p>
          <CopyCommand />
          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs/guides/getting-started"
              className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
            <a
              href={repoUrl}
              className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              View on GitHub
            </a>
          </div>
        </div>

        <Terminal title="purgeit scan ~/dev" className="shadow-xl">
          {`$ purgeit scan ~/dev
PROJECT                    SIZE  ITEMS  ACTIVE  ECOSYSTEMS
old-api                 1.3 GB      2     4mo  JS/TS
mocha                   1.8 GB      3     5mo  JS/TS · Apple
mail                    6.9 GB      1      5m  Rust
pushstack (+1 worktree)   2 GB      5      2m  JS/TS

8 projects · 14.8 GB reclaimable — scanned 1 root in 2.1s
3.1 GB of that is in 2 dormant projects — purgeit clean --stale targets them.

$ purgeit clean ~/dev --stale --dry-run
Dry run: would delete 5 artifacts, freeing 3.1 GB`}
        </Terminal>
      </section>

      <section className="border-y bg-fd-card/40">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Four checks between “found it” and “gone”
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {steps.map(([title, body], index) => (
              <li key={title} className="rounded-xl border bg-fd-background p-5">
                <span className="font-mono text-xs text-fd-primary">0{index + 1}</span>
                <h3 className="mt-2 font-medium">{title}</h3>
                <p className="mt-1 text-sm text-fd-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-center text-sm">
            <Link
              className="text-fd-primary underline-offset-4 hover:underline"
              href="/docs/concepts/safety-model"
            >
              Read the full safety model →
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body, href }) => (
            <Link
              key={title}
              href={href}
              className="group rounded-xl border bg-fd-card p-6 transition-colors hover:border-fd-primary/50 hover:bg-fd-accent/40"
            >
              <Icon className="size-5 text-fd-primary" aria-hidden="true" />
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-1.5 text-sm text-fd-muted-foreground">{body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Review first, then apply</h2>
            <p className="mt-3 text-fd-muted-foreground">
              Split finding from deleting. <code className="font-mono">scan --format json</code> is
              a plan: trim it, hand it to a person or an agent, and apply it. At deletion time every
              entry is re-checked, so a stale plan can’t delete the wrong thing.
            </p>
            <Link
              href="/docs/guides/clean-safely"
              className="mt-4 inline-block text-sm text-fd-primary underline-offset-4 hover:underline"
            >
              Clean safely →
            </Link>
          </div>
          <Terminal title="plan → review → apply">
            {`$ purgeit scan ~/dev --format json > plan.json
# remove the entries you want to keep…
$ purgeit clean --plan plan.json --yes
deleted    979.6 MB  ~/dev/personal/mocha/node_modules
deleted    942.9 MB  ~/dev/web/tallo/node_modules
Deleted 2 artifacts, freed 1.9 GB`}
          </Terminal>
        </div>
      </section>

      <section className="border-t bg-fd-card/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 py-16 text-center">
          <Library className="size-6 text-fd-primary" aria-hidden="true" />
          <h2 className="text-2xl font-semibold tracking-tight">Free your disk in a minute</h2>
          <CopyCommand />
          <Link
            href="/docs/guides/getting-started"
            className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Read the guide
          </Link>
        </div>
      </section>
    </main>
  );
}
