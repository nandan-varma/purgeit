import { Box, Text, useAnimation } from 'ink';

import { tildify } from '../cli/render.js';
import { PROTECTION_LABELS } from '../fs/protection.js';
import { describeWhen } from '../rules/condition.js';
import type { Entry } from '../scan/scan.js';
import { formatAge, formatSize } from '../units.js';
import {
  type Outcome,
  reclaimableBytes,
  selectionTotals,
  type SortKey,
  type State,
} from './state.js';

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

interface HeaderProps {
  readonly state: State;
  readonly roots: readonly string[];
  readonly home: string | undefined;
}

export function Header({ state, roots, home }: HeaderProps) {
  const scanning = state.summary === undefined;
  const totals = selectionTotals(state);
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
        <Text bold>{formatSize(reclaimableBytes(state))}</Text> reclaimable
        {totals.count > 0 ? (
          <Text color="green">
            {'  ·  '}
            {totals.count} selected ({formatSize(totals.bytes)})
          </Text>
        ) : null}
        {state.filter !== '' ? <Text color="cyan">{`  ·  filter: ${state.filter}`}</Text> : null}
      </Text>
    </Box>
  );
}

const seconds = (ms: number): string => (ms < 50 ? '<0.1s' : `${(ms / 1000).toFixed(1)}s`);

const SORT_LABEL: Record<SortKey, string> = { size: 'SIZE', age: 'AGE', path: 'PATH' };

interface Layout {
  readonly columns: number;
  /** The rule column is dropped on narrow terminals to leave the path room. */
  readonly showRule: boolean;
}

const SIZE_W = 9;
const AGE_W = 5;
const RULE_W = 16;

export function ColumnHeadings({ state, layout }: { state: State; layout: Layout }) {
  const arrow = state.descending ? '↓' : '↑';
  const mark = (key: SortKey, label: string): string =>
    state.sortKey === key ? `${label}${arrow}` : label;
  return (
    <Box flexShrink={0}>
      <Box width={6} flexShrink={0} />
      <Box width={SIZE_W} flexShrink={0} justifyContent="flex-end">
        <Text dimColor bold={state.sortKey === 'size'}>
          {mark('size', SORT_LABEL.size)}
        </Text>
      </Box>
      <Box width={AGE_W + 2} flexShrink={0} paddingLeft={2}>
        <Text dimColor bold={state.sortKey === 'age'}>
          {mark('age', SORT_LABEL.age)}
        </Text>
      </Box>
      {layout.showRule ? (
        <Box width={RULE_W + 2} flexShrink={0} paddingLeft={2}>
          <Text dimColor>RULE</Text>
        </Box>
      ) : null}
      <Box flexGrow={1} paddingLeft={2}>
        <Text dimColor bold={state.sortKey === 'path'} wrap="truncate-end">
          {mark('path', 'PATH')}
        </Text>
      </Box>
    </Box>
  );
}

interface RowProps {
  readonly entry: Entry;
  readonly cursor: boolean;
  readonly selected: boolean;
  readonly layout: Layout;
  readonly now: number;
  readonly home: string | undefined;
}

function Row({ entry, cursor, selected, layout, now, home }: RowProps) {
  const locked = entry.protection !== undefined;
  const elapsed = now - entry.lastActive;
  const dim = locked;
  return (
    <Box flexShrink={0}>
      <Box width={6} flexShrink={0}>
        <Text inverse={cursor}>{cursor ? '▸ ' : '  '}</Text>
        <Text inverse={cursor} color={selected ? 'green' : undefined} dimColor={locked}>
          {locked ? ' ⊘  ' : selected ? '[x]' : '[ ]'}
        </Text>
      </Box>
      <Box width={SIZE_W} flexShrink={0} justifyContent="flex-end">
        <Text inverse={cursor} bold={!dim && entry.bytes >= 1024 ** 3} dimColor={dim}>
          {formatSize(entry.bytes)}
        </Text>
      </Box>
      <Box width={AGE_W + 2} flexShrink={0} paddingLeft={2}>
        <Text inverse={cursor} color={dim ? undefined : ageColor(elapsed)} dimColor={dim}>
          {formatAge(elapsed)}
        </Text>
      </Box>
      {layout.showRule ? (
        <Box width={RULE_W + 2} flexShrink={0} paddingLeft={2}>
          <Text inverse={cursor} dimColor={dim} wrap="truncate-end">
            {entry.rule.name}
          </Text>
        </Box>
      ) : null}
      <Box flexGrow={1} paddingLeft={2}>
        <Text inverse={cursor} dimColor={dim} wrap="truncate-start">
          {tildify(entry.path, home)}
        </Text>
      </Box>
    </Box>
  );
}

export function List(props: {
  readonly entries: readonly Entry[];
  readonly cursorIndex: number;
  readonly selected: ReadonlySet<string>;
  readonly height: number;
  readonly layout: Layout;
  readonly now: number;
  readonly home: string | undefined;
  readonly empty: string;
}) {
  const { entries, cursorIndex, height } = props;
  if (entries.length === 0) {
    return (
      <Box height={height} flexShrink={0}>
        <Text dimColor>{props.empty}</Text>
      </Box>
    );
  }
  const start = Math.max(
    0,
    Math.min(cursorIndex - Math.floor(height / 2), entries.length - height),
  );
  return (
    <Box flexDirection="column" height={height} flexShrink={0}>
      {entries.slice(start, start + height).map((entry, offset) => (
        <Row
          key={entry.path}
          entry={entry}
          cursor={start + offset === cursorIndex}
          selected={props.selected.has(entry.path)}
          layout={props.layout}
          now={props.now}
          home={props.home}
        />
      ))}
    </Box>
  );
}

export function Detail({ entry, home }: { entry: Entry | undefined; home: string | undefined }) {
  if (entry === undefined) {
    return (
      <Box flexDirection="column" flexShrink={0}>
        <Text> </Text>
        <Text> </Text>
      </Box>
    );
  }
  const why =
    entry.protection !== undefined
      ? `protected — ${PROTECTION_LABELS[entry.protection]}`
      : entry.rule.kind === 'gated'
        ? `${entry.rule.description} · proved by ${entry.evidence ?? describeWhen(entry.rule.when)}`
        : entry.rule.kind === 'marker'
          ? `${entry.rule.description} · tagged by ${entry.rule.file}`
          : entry.rule.description;
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text wrap="truncate-start">{tildify(entry.path, home)}</Text>
      <Text dimColor wrap="truncate-end">
        {`${entry.files.toLocaleString()} files · ${why}`}
      </Text>
    </Box>
  );
}

export function Footer({ state }: { state: State }) {
  if (state.notice !== undefined) {
    return (
      <Text color="yellow" wrap="truncate-end">
        {state.notice}
      </Text>
    );
  }
  const keys: Record<State['phase'], string> = {
    browse: '↑↓ move · space select · a all · n none · / filter · s sort · enter delete · q quit',
    filter: 'type to filter · enter keep · esc clear',
    confirm: 'y delete · esc cancel',
    cleaning: 'deleting… ctrl+c to stop',
    done: 'b back to list · q quit',
  };
  return (
    <Text dimColor wrap="truncate-end">
      {keys[state.phase]}
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

export function ConfirmDialog(props: {
  readonly entries: readonly Entry[];
  readonly height: number;
  readonly home: string | undefined;
}) {
  const bytes = props.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const room = Math.max(0, props.height - 4);
  const shown = props.entries.slice(0, room);
  return (
    <Box flexDirection="column" height={props.height} flexShrink={0}>
      <Text bold color="red" wrap="truncate-end">
        Delete {props.entries.length} artifact{props.entries.length === 1 ? '' : 's'} ·{' '}
        {formatSize(bytes)}? This cannot be undone.
      </Text>
      <Text> </Text>
      {shown.map((entry) => (
        <Text key={entry.path} wrap="truncate-start">
          {`${formatSize(entry.bytes).padStart(9)}  ${tildify(entry.path, props.home)}`}
        </Text>
      ))}
      {props.entries.length > shown.length ? (
        <Text dimColor>…and {props.entries.length - shown.length} more</Text>
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
  items: readonly Outcome[];
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
