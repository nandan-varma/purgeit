import { relative } from 'node:path';

import { Box, Text, useAnimation } from 'ink';

import { tildify } from '../cli/render.js';
import { PROTECTION_LABELS } from '../fs/protection.js';
import { describeWhen } from '../rules/catalog/describe.js';
import { activityOf, groupProjects, type ProjectGroup } from '../scan/projects.js';
import type { Entry } from '../scan/scan.js';
import { formatAge, formatAgo, formatSize } from '../units.js';
import { type Row, SORT_LABELS } from './rows.js';
import { listingOf, reclaimable, selectedEntries, selectionTotals, type State } from './state.js';

const DAY = 24 * 60 * 60 * 1000;
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** How recently something was used: hot is red, settled is green. */
function ageColor(elapsed: number): 'red' | 'yellow' | 'green' {
  return elapsed < 7 * DAY ? 'red' : elapsed < 30 * DAY ? 'yellow' : 'green';
}

function Spinner() {
  const { frame } = useAnimation({ interval: 80 });
  return <Text color="cyan">{FRAMES[frame % FRAMES.length]}</Text>;
}

const seconds = (ms: number): string => (ms < 50 ? '<0.1s' : `${(ms / 1000).toFixed(1)}s`);
const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

interface HeaderProps {
  readonly state: State;
  readonly roots: readonly string[];
  readonly home: string | undefined;
}

export function Header({ state, roots, home }: HeaderProps) {
  const scanning = state.summary === undefined;
  const totals = selectionTotals(state);
  const stats = reclaimable(state);
  const listing = listingOf(state);
  const where = roots.length === 1 ? tildify(roots[0] ?? '', home) : `${roots.length} folders`;
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box justifyContent="space-between" columnGap={2}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Text bold>purgeit</Text> <Text dimColor>{where}</Text>
          </Text>
        </Box>
        <Box flexShrink={0}>
          {scanning ? (
            <Text>
              <Spinner /> scanning · {state.found} found
              {state.found > state.settled ? ` · ${state.found - state.settled} measuring` : ''}
            </Text>
          ) : (
            <Text dimColor>scanned in {seconds(state.summary?.durationMs ?? 0)}</Text>
          )}
        </Box>
      </Box>
      <Text wrap="truncate-end">
        <Text bold>{formatSize(stats.bytes)}</Text> reclaimable in{' '}
        {plural(stats.projects, 'project')}
        {stats.dormantBytes > 0 ? (
          <Text color="green">{`  ·  ${formatSize(stats.dormantBytes)} dormant (${stats.dormantProjects})`}</Text>
        ) : null}
        {totals.count > 0 ? (
          <Text color="cyan">{`  ·  ${totals.count} selected (${formatSize(totals.bytes)})`}</Text>
        ) : null}
        {state.filter !== '' ? <Text color="yellow">{`  ·  filter: ${state.filter}`}</Text> : null}
      </Text>
      <Text dimColor wrap="truncate-end">
        {`${listing.view === 'projects' ? 'projects' : 'artifacts'} · sort: ${SORT_LABELS[state.sortKey]}${state.reversed ? ' (reversed)' : ''}`}
        {listing.hidden.count > 0
          ? `  ·  +${plural(listing.hidden.count, 'small artifact')} hidden (${formatSize(listing.hidden.bytes)}) — m to show`
          : ''}
      </Text>
    </Box>
  );
}

interface Layout {
  readonly columns: number;
  /** The ecosystem column is dropped on narrow terminals to leave the name room. */
  readonly wide: boolean;
}

const SIZE_W = 9;
const AGE_W = 6;
const COUNT_W = 6;
const ECO_W = 18;

const ECOSYSTEM_SHORT: Readonly<Record<string, string>> = {
  'javascript-typescript': 'JS/TS',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  apple: 'Apple',
  'java-jvm': 'JVM',
  dotnet: '.NET',
  php: 'PHP',
  ruby: 'Ruby',
  'dart-flutter': 'Dart',
  elixir: 'Elixir',
  cpp: 'C/C++',
  haskell: 'Haskell',
  elm: 'Elm',
  zig: 'Zig',
  terraform: 'Terraform',
  'cache-marker': 'caches',
  custom: 'custom',
};

const ecosystems = (group: ProjectGroup): string =>
  group.ecosystems
    .filter((id) => id !== 'vcs')
    .map((id) => ECOSYSTEM_SHORT[id] ?? id)
    .join(' · ');

export function ColumnHeadings({ state, layout }: { state: State; layout: Layout }) {
  const projects = listingOf(state).view === 'projects';
  return (
    <Box flexShrink={0}>
      <Box width={7} flexShrink={0} />
      <Box flexGrow={1} paddingRight={2}>
        <Text dimColor wrap="truncate-end">
          {projects ? 'PROJECT' : 'ARTIFACT'}
        </Text>
      </Box>
      <Box width={SIZE_W} flexShrink={0} justifyContent="flex-end">
        <Text dimColor>SIZE</Text>
      </Box>
      {projects ? (
        <Box width={COUNT_W + 1} flexShrink={0} justifyContent="flex-end">
          <Text dimColor>ITEMS</Text>
        </Box>
      ) : null}
      <Box width={AGE_W + 1} flexShrink={0} justifyContent="flex-end">
        <Text dimColor>ACTIVE</Text>
      </Box>
      {layout.wide && projects ? (
        <Box width={ECO_W + 2} flexShrink={0} paddingLeft={2}>
          <Text dimColor>ECOSYSTEMS</Text>
        </Box>
      ) : null}
    </Box>
  );
}

const CHECK = { all: '[x]', some: '[~]', none: '[ ]' } as const;

interface RowProps {
  readonly row: Row;
  readonly cursor: boolean;
  readonly selected: ReadonlySet<string>;
  readonly layout: Layout;
  readonly now: number;
  readonly home: string | undefined;
}

function ProjectRow({
  row,
  cursor,
  layout,
  now,
}: RowProps & { row: Extract<Row, { type: 'project' }> }) {
  const { group } = row;
  const elapsed = now - activityOf(group);
  const lockedOnly = group.artifacts === 0;
  return (
    <Box flexShrink={0}>
      <Box width={7} flexShrink={0}>
        <Text inverse={cursor}>{cursor ? '▸ ' : '  '}</Text>
        <Text
          inverse={cursor}
          dimColor={lockedOnly}
          color={row.selection === 'none' ? undefined : 'cyan'}
        >
          {lockedOnly ? ' ⊘  ' : `${CHECK[row.selection]} `}
        </Text>
        <Text inverse={cursor} dimColor>
          {row.expanded ? '⌄' : '›'}
        </Text>
      </Box>
      <Box flexGrow={1} paddingRight={2}>
        <Text inverse={cursor} bold wrap="truncate-end">
          {group.name}
          <Text dimColor={!cursor} inverse={cursor}>
            {group.worktrees > 0 ? `  +${plural(group.worktrees, 'worktree')}` : ''}
          </Text>
        </Text>
      </Box>
      <Box width={SIZE_W} flexShrink={0} justifyContent="flex-end">
        <Text inverse={cursor} bold={group.bytes >= 1024 ** 3}>
          {formatSize(group.bytes)}
        </Text>
      </Box>
      <Box width={COUNT_W + 1} flexShrink={0} justifyContent="flex-end">
        <Text inverse={cursor} dimColor={!cursor}>
          {group.artifacts}
        </Text>
      </Box>
      <Box width={AGE_W + 1} flexShrink={0} justifyContent="flex-end">
        <Text inverse={cursor} color={ageColor(elapsed)}>
          {formatAge(elapsed)}
        </Text>
      </Box>
      {layout.wide ? (
        <Box width={ECO_W + 2} flexShrink={0} paddingLeft={2}>
          <Text inverse={cursor} dimColor={!cursor} wrap="truncate-end">
            {ecosystems(group)}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

function ArtifactRow({
  row,
  cursor,
  selected,
  now,
  home,
}: RowProps & { row: Extract<Row, { type: 'artifact' }> }) {
  const { entry, nested } = row;
  const locked = entry.protection !== undefined;
  const elapsed = now - entry.lastActive;
  const place = nested ? relative(entry.project.root, entry.path) : tildify(entry.path, home);
  return (
    <Box flexShrink={0}>
      <Box width={7} flexShrink={0}>
        <Text inverse={cursor}>{cursor ? '▸ ' : '  '}</Text>
        <Text
          inverse={cursor}
          color={selected.has(entry.path) ? 'cyan' : undefined}
          dimColor={locked}
        >
          {nested ? '  ' : ''}
          {locked ? ' ⊘ ' : selected.has(entry.path) ? '[x]' : '[ ]'}
        </Text>
      </Box>
      <Box flexGrow={1} paddingRight={2}>
        <Text inverse={cursor} dimColor={locked || nested} wrap="truncate-start">
          {place}
        </Text>
      </Box>
      <Box width={SIZE_W} flexShrink={0} justifyContent="flex-end">
        <Text inverse={cursor} dimColor={locked}>
          {formatSize(entry.bytes)}
        </Text>
      </Box>
      <Box width={AGE_W + 1} flexShrink={0} justifyContent="flex-end">
        <Text inverse={cursor} color={locked ? undefined : ageColor(elapsed)} dimColor={locked}>
          {formatAge(elapsed)}
        </Text>
      </Box>
    </Box>
  );
}

export function List(props: {
  readonly rows: readonly Row[];
  readonly cursorIndex: number;
  readonly selected: ReadonlySet<string>;
  readonly height: number;
  readonly layout: Layout;
  readonly now: number;
  readonly home: string | undefined;
  readonly empty: string;
}) {
  const { rows, cursorIndex, height } = props;
  if (rows.length === 0) {
    return (
      <Box height={height} flexShrink={0}>
        <Text dimColor>{props.empty}</Text>
      </Box>
    );
  }
  const start = Math.max(0, Math.min(cursorIndex - Math.floor(height / 2), rows.length - height));
  return (
    <Box flexDirection="column" height={height} flexShrink={0}>
      {rows.slice(start, start + height).map((row, offset) => {
        const common = {
          cursor: start + offset === cursorIndex,
          selected: props.selected,
          layout: props.layout,
          now: props.now,
          home: props.home,
        };
        return row.type === 'project' ? (
          <ProjectRow key={row.id} row={row} {...common} />
        ) : (
          <ArtifactRow key={row.id} row={row} {...common} />
        );
      })}
    </Box>
  );
}

function artifactWhy(entry: Entry): string {
  if (entry.protection !== undefined) return `protected — ${PROTECTION_LABELS[entry.protection]}`;
  const rule =
    entry.rule.kind === 'gated'
      ? `${entry.rule.description} · proved by ${entry.evidence ?? describeWhen(entry.rule.when)}`
      : entry.rule.kind === 'marker'
        ? `${entry.rule.description} · tagged by ${entry.rule.file}`
        : entry.rule.description;
  const notes = [
    entry.gitIgnored === true
      ? 'git-ignored ✓'
      : entry.gitIgnored === false
        ? '⚠ not git-ignored'
        : '',
    entry.synced === undefined ? '' : `☁ in ${entry.synced} — deleting may sync slowly`,
  ].filter(Boolean);
  return [rule, ...notes].join(' · ');
}

export function Detail({
  row,
  now,
  home,
}: {
  row: Row | undefined;
  now: number;
  home: string | undefined;
}) {
  if (row === undefined) {
    return (
      <Box flexDirection="column" flexShrink={0}>
        <Text> </Text>
        <Text> </Text>
      </Box>
    );
  }
  if (row.type === 'artifact') {
    return (
      <Box flexDirection="column" flexShrink={0}>
        <Text wrap="truncate-start">{tildify(row.entry.path, home)}</Text>
        <Text dimColor wrap="truncate-end">
          {`${row.entry.files.toLocaleString()} file${row.entry.files === 1 ? '' : 's'} · ${artifactWhy(row.entry)}`}
        </Text>
      </Box>
    );
  }
  const { group } = row;
  const touched =
    group.touchedAt === undefined
      ? `artifacts last changed ${formatAgo(now - group.lastActive)} (no git history)`
      : `last git activity ${formatAgo(now - group.touchedAt)}`;
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text wrap="truncate-start">{tildify(group.key, home)}</Text>
      <Text dimColor wrap="truncate-end">
        {`${row.dormant ? 'dormant' : 'active'} · ${touched} · ${plural(group.artifacts, 'artifact')}${group.protected > 0 ? `, ${group.protected} protected` : ''}`}
      </Text>
    </Box>
  );
}

const FOOTERS: Record<State['phase'], string> = {
  browse:
    'space select · R recommended · enter review · →← expand · / filter · s sort · v view · ? help · q quit',
  filter: 'type to filter · enter keep · esc clear',
  confirm: 'y delete · esc cancel',
  cleaning: 'deleting… ctrl+c to stop',
  done: 'b back to list · q quit',
  help: 'esc to close',
};

export function Footer({ state }: { state: State }) {
  if (state.notice !== undefined) {
    return (
      <Text color="yellow" wrap="truncate-end">
        {state.notice}
      </Text>
    );
  }
  return (
    <Text dimColor wrap="truncate-end">
      {FOOTERS[state.phase]}
    </Text>
  );
}

export function FilterBar({ state }: { state: State }) {
  return (
    <Text wrap="truncate-end">
      <Text color="cyan">/</Text>
      {state.filter}
      <Text inverse> </Text>
    </Text>
  );
}

export function ConfirmDialog(props: { readonly state: State; readonly height: number }) {
  const { state } = props;
  const entries = selectedEntries(state);
  const groups = groupProjects(entries).toSorted((a, b) => b.bytes - a.bytes);
  const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const active = groups.filter((group) => state.now - activityOf(group) < 7 * DAY);
  const synced = entries.filter((entry) => entry.synced !== undefined).length;
  const notes = (active.length > 0 ? 1 : 0) + (synced > 0 ? 1 : 0);
  const room = Math.max(0, props.height - 3 - notes);
  const shown = groups.slice(0, room);
  return (
    <Box flexDirection="column" height={props.height} flexShrink={0}>
      <Text bold color="red" wrap="truncate-end">
        {`Delete ${plural(entries.length, 'artifact')} in ${plural(groups.length, 'project')} · ${formatSize(bytes)}? This cannot be undone.`}
      </Text>
      <Text> </Text>
      {shown.map((group) => (
        <Text key={group.key} wrap="truncate-end">
          {`${formatSize(group.bytes).padStart(9)}  ${group.name}`}
          <Text dimColor>{`  ${plural(group.entries.length, 'artifact')}`}</Text>
          {state.now - activityOf(group) < 7 * DAY ? (
            <Text color="yellow">{`  active ${formatAgo(state.now - activityOf(group))}`}</Text>
          ) : null}
        </Text>
      ))}
      {groups.length > shown.length ? (
        <Text dimColor>…and {groups.length - shown.length} more projects</Text>
      ) : null}
      {active.length > 0 ? (
        <Text color="yellow" wrap="truncate-end">
          {`⚠ ${plural(active.length, 'project')} worked on in the last week — deleting dependencies there means a reinstall.`}
        </Text>
      ) : null}
      {synced > 0 ? (
        <Text color="yellow" wrap="truncate-end">
          {`☁ ${plural(synced, 'artifact')} sit in cloud-synced folders; deleting may sync slowly.`}
        </Text>
      ) : null}
    </Box>
  );
}

export function Cleaning({ state, height }: { state: State; height: number }) {
  const { targets, handled, current } = state.cleaning;
  const total = targets.length;
  return (
    <Box flexDirection="column" height={height} flexShrink={0}>
      <Text wrap="truncate-end">
        <Spinner /> Deleting {handled}/{total}
      </Text>
      <Text dimColor wrap="truncate-start">
        {current ?? ' '}
      </Text>
    </Box>
  );
}

function Outcomes({
  title,
  items,
  room,
  color,
}: {
  title: string;
  items: readonly { path: string; message: string }[];
  room: number;
  color: string;
}) {
  if (items.length === 0 || room < 2) return null;
  const shown = items.slice(0, room - 1);
  return (
    <>
      <Text color={color} bold>
        {title} ({items.length})
      </Text>
      {shown.map((item) => (
        <Text key={item.path} wrap="truncate-end">
          {`  ${item.path} — ${item.message}`}
        </Text>
      ))}
    </>
  );
}

export function Done({ state, height }: { state: State; height: number }) {
  const result = state.result;
  return (
    <Box flexDirection="column" height={height} flexShrink={0}>
      <Text bold color="green" wrap="truncate-end">
        Freed {formatSize(result?.bytes ?? 0)} · deleted {result?.deleted ?? 0}
      </Text>
      <Outcomes
        title="Skipped"
        items={state.refused}
        room={Math.floor((height - 1) / 2)}
        color="yellow"
      />
      <Outcomes
        title="Failed"
        items={state.failed}
        room={Math.floor((height - 1) / 2)}
        color="red"
      />
    </Box>
  );
}

const HELP: readonly (readonly [string, string])[] = [
  ['↑ ↓  k j', 'move'],
  ['→ ←  l h', 'expand / collapse a project (← on an artifact jumps to its project)'],
  ['e  E', 'expand all / collapse all'],
  ['space', 'select a row — on a project, all of its artifacts'],
  ['a  n  i', 'select all shown / none / invert'],
  ['R', 'select every artifact in dormant projects (untouched 30+ days)'],
  ['/', 'filter by project, path or rule (esc clears)'],
  ['s  r', 'cycle sort (dormant first, size, oldest, name) / reverse'],
  ['v', 'projects ⇄ flat artifact list'],
  ['m', 'show / hide small artifacts'],
  ['enter', 'review the selection — then y deletes, esc cancels'],
  ['q', 'quit'],
];

export function Help({ height }: { height: number }) {
  return (
    <Box flexDirection="column" height={height} flexShrink={0}>
      <Text bold>Keys</Text>
      {HELP.slice(0, Math.max(0, height - 1)).map(([keys, what]) => (
        <Text key={keys} wrap="truncate-end">
          <Text color="cyan">{keys.padEnd(12)}</Text>
          {what}
        </Text>
      ))}
    </Box>
  );
}
