import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { clean } from '../clean/clean.js';
import type { RuleSet } from '../rules/rule-set.js';
import { type ScanOptions, scan } from '../scan/scan.js';
import {
  Cleaning,
  ColumnHeadings,
  ConfirmDialog,
  Detail,
  Done,
  FilterBar,
  Footer,
  Header,
  List,
} from './components.js';
import { cursorIndex, initialState, reducer, selectedEntries, visibleEntries } from './state.js';

export interface AppProps {
  readonly roots: readonly string[];
  readonly rules: RuleSet;
  readonly scanOptions: Omit<ScanOptions, 'signal' | 'io'>;
  /** Refuse to delete anything modified within this many ms. */
  readonly idleFor: number;
  readonly historyFile: string | undefined;
  readonly home?: string | undefined;
}

/** What the app resolves with when it exits. */
export interface TuiExit {
  readonly count: number;
  readonly bytes: number;
}

/** Rows used by everything but the list: header (2), headings (1), rule (1), detail (2), footer (1). */
const CHROME_ROWS = 7;
const NARROW = 72;

export function App(props: AppProps) {
  const { roots, rules, scanOptions, idleFor, historyFile, home } = props;
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      for await (const event of scan(roots, { ...scanOptions, signal: controller.signal })) {
        dispatch({ type: 'scan', event });
      }
    })();
    return () => controller.abort();
  }, [roots, scanOptions]);

  const cleaning = state.phase === 'cleaning';
  useEffect(() => {
    if (!cleaning) return;
    const controller = new AbortController();
    const targets = selectedEntries(latest.current).map((entry) => ({
      path: entry.path,
      bytes: entry.bytes,
      unchangedSince: entry.lastActive,
    }));
    void (async () => {
      for await (const event of clean(targets, {
        rules,
        roots,
        idleFor,
        signal: controller.signal,
        ...(historyFile === undefined ? {} : { historyFile }),
      })) {
        dispatch({ type: 'clean', event });
      }
    })();
    return () => controller.abort();
  }, [cleaning, rules, roots, idleFor, historyFile]);

  const visible = useMemo(() => visibleEntries(state), [state]);
  const index = cursorIndex(state, visible);
  const height = Math.max(3, rows - CHROME_ROWS);

  useInput((input, key) => {
    dispatch({
      type: 'key',
      pageSize: height - 1,
      key: {
        input,
        up: key.upArrow,
        down: key.downArrow,
        pageUp: key.pageUp,
        pageDown: key.pageDown,
        home: key.home,
        end: key.end,
        enter: key.return,
        escape: key.escape,
        backspace: key.backspace || key.delete,
        ctrl: key.ctrl,
        meta: key.meta,
      },
    });
  });

  const { quit, freedCount, freedBytes } = state;
  useEffect(() => {
    if (quit) exit({ count: freedCount, bytes: freedBytes } satisfies TuiExit);
  }, [quit, freedCount, freedBytes, exit]);

  const layout = { columns, showRule: columns >= NARROW };
  const now = Date.now();
  const cursorEntry = visible[index];
  const empty =
    state.summary === undefined
      ? 'Looking for artifacts…'
      : state.filter !== ''
        ? `Nothing matches "${state.filter}".`
        : 'Nothing to clean — no artifacts found.';

  let body: React.ReactNode;
  if (state.phase === 'confirm') {
    body = <ConfirmDialog entries={selectedEntries(state)} height={height + 1} home={home} />;
  } else if (state.phase === 'cleaning') {
    body = <Cleaning state={state} height={height + 1} />;
  } else if (state.phase === 'done') {
    body = <Done state={state} height={height + 1} />;
  } else {
    body = (
      <>
        <ColumnHeadings state={state} layout={layout} />
        <List
          entries={visible}
          cursorIndex={index}
          selected={state.selected}
          height={height}
          layout={layout}
          now={now}
          home={home}
          empty={empty}
        />
      </>
    );
  }
  const browsing = state.phase === 'browse' || state.phase === 'filter';

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header state={state} roots={roots} home={home} />
      {body}
      <Text dimColor>{'─'.repeat(Math.max(0, columns))}</Text>
      {browsing ? (
        <Detail entry={cursorEntry} home={home} />
      ) : (
        <Detail entry={undefined} home={home} />
      )}
      {state.phase === 'filter' ? <FilterBar state={state} /> : <Footer state={state} />}
    </Box>
  );
}
