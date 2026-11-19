'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';

const RUNNERS = [
  { id: 'npx', command: 'npx purgeit ~/dev' },
  { id: 'bunx', command: 'bunx purgeit ~/dev' },
  { id: 'pnpm', command: 'pnpm dlx purgeit ~/dev' },
  { id: 'npm -g', command: 'npm install -g purgeit' },
] as const;

/** Install command with a package-manager switch and a copy button. */
export function CopyCommand({ className }: { className?: string }) {
  const [runner, setRunner] = useState<(typeof RUNNERS)[number]>(RUNNERS[0]);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(runner.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn('w-full max-w-md rounded-xl border bg-fd-card shadow-sm', className)}>
      <div className="flex gap-1 border-b px-2 pt-2" role="tablist" aria-label="Package manager">
        {RUNNERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={runner.id === item.id}
            onClick={() => setRunner(item)}
            className={cn(
              'rounded-t-md px-3 py-1.5 font-mono text-xs transition-colors',
              runner.id === item.id
                ? 'bg-fd-muted text-fd-foreground'
                : 'text-fd-muted-foreground hover:text-fd-foreground',
            )}
          >
            {item.id}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-sm">
        <code className="overflow-x-auto whitespace-nowrap">
          <span className="select-none text-fd-primary">$ </span>
          {runner.command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy command'}
          className="shrink-0 rounded-md p-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        >
          {copied ? <Check className="size-4 text-fd-primary" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
