import { cn } from '@/lib/cn';

/**
 * A terminal window for command examples. Lines starting with `$ ` are
 * commands; lines starting with `#` are comments; everything else is output.
 */
export function Terminal({
  title = 'terminal',
  children,
  className,
}: {
  title?: string;
  children: string;
  className?: string;
}) {
  const lines = children.replace(/^\n|\n$/g, '').split('\n');
  return (
    <figure
      className={cn(
        'not-prose my-6 overflow-hidden rounded-xl border bg-fd-card text-left shadow-sm',
        className,
      )}
    >
      <figcaption className="flex items-center gap-2 border-b bg-fd-muted/50 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-red-400/70" />
          <i className="size-2.5 rounded-full bg-amber-400/70" />
          <i className="size-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="ml-2 font-mono text-xs text-fd-muted-foreground">{title}</span>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6">
        <code>
          {lines.map((line, index) =>
            line.startsWith('$ ') ? (
              <span key={index} className="block">
                <span className="select-none text-fd-primary">$ </span>
                {line.slice(2)}
              </span>
            ) : line.startsWith('#') ? (
              <span key={index} className="block text-fd-muted-foreground">
                {line}
              </span>
            ) : (
              <span key={index} className="block text-fd-foreground/80">
                {line || ' '}
              </span>
            ),
          )}
        </code>
      </pre>
    </figure>
  );
}
