import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { deleteEntries } from '../delete/deleter.js';
import type { ScanOptions } from '../scan/scanner.js';
import type { ResolvedRuleSet } from '../types.js';
import { ArtifactList } from './components/ArtifactList.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { DeletingProgress } from './components/DeletingProgress.js';
import { DoneSummary } from './components/DoneSummary.js';
import { Header } from './components/Header.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { Legend } from './components/Legend.js';
import { computeVisibleRows } from './layout.js';
import { theme } from './theme.js';
import { useScanner } from './useScanner.js';
import { useTerminalSize } from './useTerminalSize.js';

export interface AppProps {
  root: string;
  ruleSet: ResolvedRuleSet;
  scanOpts: ScanOptions;
  signal?: AbortSignal | undefined;
}

export function App({ root, ruleSet, scanOpts, signal }: AppProps) {
  const [state, dispatch] = useScanner(root, ruleSet, scanOpts);
  const { exit } = useApp();
  const { rows } = useTerminalSize();
  const pageSize = computeVisibleRows(rows);
  // Not part of AppState: it's a pure UI overlay unrelated to the scan/
  // delete state machine, so it doesn't belong in the reducer.
  const [showHelp, setShowHelp] = useState(false);

  // Handle deletion. Only re-runs when entering the 'deleting' phase, not on
  // every entries/selected change while scanning (state.entries.filter's
  // identity would change every render, re-triggering this on each incoming
  // scan event).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — see comment above
  useEffect(() => {
    if (state.phase !== 'deleting') return;
    const selected = state.entries.filter((e) => state.selected.has(e.path)).map((e) => e.path);

    const run = async () => {
      let deleted = 0;
      let failed = 0;
      for await (const event of deleteEntries(selected, { signal, dryRun: false })) {
        if (event.type === 'done') {
          deleted = event.deleted;
          failed = event.failed;
        }
      }
      dispatch({ type: 'DELETE_DONE', deleted, failed });
    };
    void run();
  }, [state.phase]);

  // Keymap
  useInput((input, key) => {
    if (state.phase === 'deleting') return;

    // The help overlay is a modal on top of 'ready' — any key dismisses it
    // rather than falling through to whatever it would normally do, so a
    // stray space/enter right after opening help can't select/confirm.
    if (showHelp) {
      setShowHelp(false);
      return;
    }

    // q/Ctrl+C quit from any other phase, including after a scan/delete has
    // finished ('done'/'error') — without this, unmount() is never called
    // and the process hangs forever after the summary is shown.
    if (input === 'q' || (key.ctrl && input === 'c')) {
      dispatch({ type: 'QUIT' });
      exit();
      return;
    }

    if (state.phase === 'scanning' || state.phase === 'done' || state.phase === 'error') return;

    if (state.phase === 'confirming') {
      if (input === 'y' || input === 'Y') {
        dispatch({ type: 'START_DELETE' });
      } else if (input === 'n' || input === 'N' || key.escape) {
        dispatch({ type: 'CANCEL_CONFIRM' });
      }
      return;
    }

    // ready phase
    if (key.upArrow || input === 'k') {
      dispatch({ type: 'MOVE_CURSOR', delta: -1 });
    } else if (key.downArrow || input === 'j') {
      dispatch({ type: 'MOVE_CURSOR', delta: 1 });
    } else if (key.pageUp) {
      dispatch({ type: 'SET_CURSOR', index: state.cursor - pageSize });
    } else if (key.pageDown) {
      dispatch({ type: 'SET_CURSOR', index: state.cursor + pageSize });
    } else if (key.home || input === 'g') {
      dispatch({ type: 'SET_CURSOR', index: 0 });
    } else if (key.end || input === 'G') {
      dispatch({ type: 'SET_CURSOR', index: state.entries.length - 1 });
    } else if (input === ' ') {
      dispatch({ type: 'TOGGLE_SELECT' });
    } else if (input === 'a') {
      dispatch({ type: 'SELECT_ALL' });
    } else if (input === 'n') {
      dispatch({ type: 'CLEAR_SELECTION' });
    } else if (input === 'i') {
      dispatch({ type: 'INVERT_SELECTION' });
    } else if (input === 's') {
      dispatch({ type: 'CYCLE_SORT' });
    } else if (input === 'r') {
      dispatch({ type: 'REVERSE_SORT' });
    } else if (input === '?') {
      setShowHelp(true);
    } else if (key.return && state.selected.size > 0) {
      dispatch({ type: 'ENTER_CONFIRM' });
    }
  });

  const showWarnings =
    state.warnings.length > 0 && (state.phase === 'ready' || state.phase === 'confirming');

  // Render
  return (
    <Box flexDirection="column">
      <Header root={root} state={state} />
      {state.phase === 'error' && (
        <Box marginTop={1}>
          <Text color={theme.danger}>✗ Error: {state.error}</Text>
        </Box>
      )}
      {showWarnings && (
        <Box flexDirection="column" marginTop={1}>
          {state.warnings.slice(0, 3).map((w) => (
            <Text key={w.file} color={theme.warning}>
              ⚠ {w.file}: {w.message}
            </Text>
          ))}
          {state.warnings.length > 3 && (
            <Text dimColor>... {state.warnings.length - 3} more warning(s)</Text>
          )}
        </Box>
      )}
      {showHelp && <HelpOverlay />}
      {!showHelp &&
        (state.phase === 'scanning' || state.phase === 'ready' || state.phase === 'confirming') && (
          <Box marginTop={1}>
            <ArtifactList state={state} />
          </Box>
        )}
      {!showHelp && state.phase === 'confirming' && <ConfirmDialog state={state} />}
      {state.phase === 'deleting' && (
        <DeletingProgress
          deleted={state.deletion?.deleted ?? 0}
          failed={state.deletion?.failed ?? 0}
        />
      )}
      {state.phase === 'done' && <DoneSummary state={state} />}
      <Legend />
    </Box>
  );
}
