import { useStdout } from 'ink';
import { useEffect, useState } from 'react';

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

function readSize(stdout: NodeJS.WriteStream): TerminalSize {
  return {
    columns: stdout.columns || DEFAULT_COLUMNS,
    rows: stdout.rows || DEFAULT_ROWS,
  };
}

/**
 * Live terminal dimensions. `useStdout().stdout.columns/rows` only reflect
 * the size *at the moment a component renders* — Ink itself recomputes its
 * own root Yoga layout on resize (see ink's Ink.resized()), but that alone
 * doesn't cause React components to re-render, so anything computed from
 * columns/rows in JS (not pure Yoga flexGrow/flexShrink) goes stale after a
 * resize until some unrelated keypress happens to re-render the tree. This
 * hook subscribes to stdout's 'resize' event directly so components using it
 * re-render immediately when the terminal is resized.
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => readSize(stdout));

  useEffect(() => {
    const onResize = () => setSize(readSize(stdout));
    onResize(); // stdout may have already changed size between initial render and this effect running
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}
