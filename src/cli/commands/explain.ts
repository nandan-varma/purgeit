import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { inspect } from '../../clean/guard.js';
import { PurgeitError } from '../../errors.js';
import { measure } from '../../fs/measure.js';
import { findProtection, isGitIgnored, PROTECTION_LABELS } from '../../fs/protection.js';
import { describeWhen } from '../../rules/catalog/describe.js';
import { matchPath } from '../../rules/match.js';
import { findProject, projectName } from '../../scan/project.js';
import { syncProvider } from '../../scan/sync.js';
import { formatAgo, formatSize, parseDuration } from '../../units.js';
import type { CliEnv } from '../env.js';
import { resolveRules } from '../options.js';
import { tildify } from '../render.js';

export interface ExplainFlags {
  config: string | boolean;
  minAge?: string;
  format: 'text' | 'json';
}

interface Finding {
  readonly ok: boolean;
  readonly text: string;
}

/**
 * Explains a directory: which rule claims it and why, what it belongs to,
 * whether anything protects it, and what `clean` would do — using the same
 * checks `clean` runs, so the answer can never disagree with the action.
 */
export async function runExplain(path: string, flags: ExplainFlags, env: CliEnv): Promise<number> {
  const target = resolve(env.cwd, path);
  const stats = await stat(target).catch(() => undefined);
  if (stats === undefined) throw new PurgeitError(`No such directory: ${target}`);
  if (!stats.isDirectory()) throw new PurgeitError(`Not a directory: ${target}`);

  const { rules, config } = await resolveRules(
    { config: flags.config, only: [], safeOnly: false },
    env,
  );
  const now = Date.now();
  const idleFor = parseDuration(flags.minAge ?? config.minAge ?? '7d');

  const hit = await matchPath(rules, target);
  const name = basename(target);
  const named = rules.named.get(name);
  const project = await findProject(target);
  const [measured, protection, gitIgnored] = await Promise.all([
    measure(target),
    findProtection(target),
    project === undefined || project.kind === 'folder' ? undefined : isGitIgnored(target),
  ]);
  const synced = syncProvider(target, env.home);
  const verdict = await inspect(
    { path: target },
    {
      rules,
      realRoots: [await realpath(dirname(target))],
      idleFor,
      now,
    },
  );

  const findings: Record<string, Finding> = {
    rule: hit
      ? {
          ok: true,
          text: `${hit.rule.name} — ${hit.rule.description}${hit.evidence ? ` (proved by ${hit.evidence})` : hit.rule.kind === 'safe' ? ' (safe wherever it appears)' : ''}`,
        }
      : {
          ok: false,
          text: rules.ignore.has(name)
            ? `"${name}" is never entered (version-control metadata or an ignore rule)`
            : named?.kind === 'gated'
              ? `"${name}" is a gated rule, but nothing beside it proves it is generated — needs ${describeWhen(named.when)}`
              : `no rule claims a directory named "${name}"`,
        },
    project: {
      ok: project !== undefined,
      text:
        project === undefined
          ? 'not inside a git repository or a recognised project folder'
          : `${projectName(project)} (${project.kind}, ${tildify(project.root, env.home)})${project.touchedAt === undefined ? '' : ` · last git activity ${formatAgo(now - project.touchedAt)}`}`,
    },
    size: {
      ok: true,
      text: `${formatSize(measured.bytes)} in ${measured.files.toLocaleString()} file${measured.files === 1 ? '' : 's'} · last changed ${formatAgo(now - measured.lastActive)}`,
    },
    protection: {
      ok: protection === undefined,
      text:
        protection === undefined ? 'nothing marks it as authored' : PROTECTION_LABELS[protection],
    },
    git: {
      ok: gitIgnored !== false,
      text:
        gitIgnored === undefined
          ? 'not in a git repository'
          : gitIgnored
            ? 'ignored by git — evidence it is not authored'
            : 'NOT ignored by git — it shows up in `git status`',
    },
    synced: {
      ok: synced === undefined,
      text:
        synced === undefined
          ? 'not in a cloud-synced folder'
          : `inside ${synced} — deleting thousands of files may sync slowly`,
    },
    verdict:
      'refusal' in verdict
        ? { ok: false, text: `clean would skip it: ${verdict.refusal.message}` }
        : { ok: true, text: 'clean would delete it' },
  };

  if (flags.format === 'json') {
    env.out(
      JSON.stringify(
        {
          path: target,
          matched: hit !== undefined,
          rule: hit?.rule.name ?? null,
          evidence: hit?.evidence ?? null,
          project: project ? { name: projectName(project), ...project } : null,
          bytes: measured.bytes,
          files: measured.files,
          lastActive: measured.lastActive,
          protection: protection ?? null,
          gitIgnored: gitIgnored ?? null,
          synced: synced ?? null,
          wouldDelete: !('refusal' in verdict),
          refusal: 'refusal' in verdict ? verdict.refusal : null,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  env.out(tildify(target, env.home));
  for (const [label, finding] of Object.entries(findings)) {
    env.out(`  ${label.padEnd(10)} ${finding.ok ? '✓' : '✗'} ${finding.text}`);
  }
  return 0;
}
