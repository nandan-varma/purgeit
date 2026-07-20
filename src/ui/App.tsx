import { Text, useInput } from 'ink';
import React, { useEffect } from 'react';
import { deleteEntries } from '../delete/deleter.js';
import type { ScanOptions } from '../scan/scanner.js';
import type { ResolvedRuleSet } from '../types.js';
import { ArtifactList } from './components/ArtifactList.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { DeletingProgress } from './components/DeletingProgress.js';
import { DoneSummary } from './components/DoneSummary.js';
import { Header } from './components/Header.js';
import { Legend } from './components/Legend.js';
import { useScanner } from './useScanner.js';

export interface AppProps {
  root: string;
  ruleSet: ResolvedRuleSet;
  scanOpts: ScanOptions;
  signal?: AbortSignal | undefined;
}

export function App({ root, ruleSet, scanOpts, signal }: AppProps) {
  const [state, dispatch] = useScanner(root, ruleSet, scanOpts);

  // Handle deletion
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
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keymap
  useInput((input, key) => {
    if (state.phase === 'scanning' || state.phase === 'deleting') return;

    if (state.phase === 'confirming') {
      if (input === 'y' || input === 'Y') {
        dispatch({ type: 'START_DELETE' });
      } else if (input === 'n' || input === 'N' || key.escape) {
        dispatch({ type: 'CANCEL_CONFIRM' });
      }
      return;
    }

    if (state.phase === 'done' || state.phase === 'error') {
      return;
    }

    // ready phase
    if (key.upArrow || input === 'k') {
      dispatch({ type: 'MOVE_CURSOR', delta: -1 });
    } else if (key.downArrow || input === 'j') {
      dispatch({ type: 'MOVE_CURSOR', delta: 1 });
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
    } else if (key.return && state.selected.size > 0) {
      dispatch({ type: 'ENTER_CONFIRM' });
    } else if (input === 'q' || (key.ctrl && input === 'c')) {
      dispatch({ type: 'QUIT' });
    }
  });

  // Render
  return (
    <>
      <Header root={root} state={state} />
      {state.phase === 'error' && <Text color="red">Error: {state.error}</Text>}
      {(state.phase === 'scanning' || state.phase === 'ready' || state.phase === 'confirming') && (
        <ArtifactList state={state} />
      )}
      {state.phase === 'confirming' && <ConfirmDialog state={state} />}
      {state.phase === 'deleting' && (
        <DeletingProgress
          deleted={state.deletion?.deleted ?? 0}
          failed={state.deletion?.failed ?? 0}
        />
      )}
      {state.phase === 'done' && <DoneSummary state={state} />}
      <Legend />
    </>
  );
}
