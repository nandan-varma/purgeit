import { useEffect, useState } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const INTERVAL_MS = 80;

/** A braille-dot spinner frame, animating only while `active` is true. */
export function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);

  // frame is always a valid index via the modulo in setFrame above.
  return active ? (FRAMES[frame] as string) : '';
}
