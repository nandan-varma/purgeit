'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

interface Rule {
  name: string;
  kind: string;
  categories: string[];
  description: string;
  when: string | null;
  file: string | null;
}

const KIND: Record<string, { label: string; className: string }> = {
  safe: { label: 'safe', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  gated: { label: 'gated', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  marker: { label: 'tagged', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  ignore: { label: 'pruned', className: 'bg-fd-muted text-fd-muted-foreground' },
};

/** A searchable, filterable view of every built-in rule. */
export function RulesBrowser({
  rules,
  categories,
}: {
  rules: Rule[];
  categories: { id: string; label: string }[];
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rules.filter(
      (rule) =>
        (category === null || rule.categories.includes(category)) &&
        (needle === '' ||
          rule.name.toLowerCase().includes(needle) ||
          rule.description.toLowerCase().includes(needle)),
    );
  }, [rules, query, category]);

  return (
    <div className="not-prose my-6">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fd-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${rules.length} rules — try “next”, “gradle”, “cache”`}
          aria-label="Search rules"
          className="w-full rounded-lg border bg-fd-card py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by ecosystem">
        {[{ id: null, label: 'All' }, ...categories].map((item) => (
          <button
            key={item.id ?? 'all'}
            type="button"
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              category === item.id
                ? 'border-fd-primary bg-fd-primary text-fd-primary-foreground'
                : 'text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs text-fd-muted-foreground" aria-live="polite">
        {shown.length} of {rules.length} rules
      </p>

      <ul className="mt-2 divide-y overflow-hidden rounded-lg border">
        {shown.map((rule) => (
          <li key={rule.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
            <div className="flex items-center gap-2">
              <code className="font-mono text-[13px] font-medium">{rule.name}</code>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  KIND[rule.kind]?.className,
                )}
              >
                {KIND[rule.kind]?.label ?? rule.kind}
              </span>
            </div>
            <div className="text-sm">
              <p>{rule.description}</p>
              {rule.when && (
                <p className="mt-1 text-xs text-fd-muted-foreground">
                  Only beside: <span className="font-mono">{rule.when}</span>
                </p>
              )}
              {rule.file && (
                <p className="mt-1 text-xs text-fd-muted-foreground">
                  Any directory containing <span className="font-mono">{rule.file}</span>
                </p>
              )}
            </div>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-fd-muted-foreground">
            No rules match. Missing something? You can{' '}
            <Link className="underline" href="/docs/guides/custom-rules">
              add your own
            </Link>
            .
          </li>
        )}
      </ul>
    </div>
  );
}
