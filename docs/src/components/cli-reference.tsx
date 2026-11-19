import commands from '@/generated/cli.json';

type Command = (typeof commands)[number];

const usage = (command: Command) =>
  [
    'purgeit',
    command.name,
    ...command.arguments.map((a) =>
      a.required ? `<${a.name}>` : `[${a.name}${a.variadic ? '…' : ''}]`,
    ),
    command.options.length > 0 ? '[options]' : '',
  ]
    .filter(Boolean)
    .join(' ');

const shown = (value: unknown): string =>
  value === null || value === false || (Array.isArray(value) && value.length === 0)
    ? ''
    : Array.isArray(value)
      ? value.join(', ')
      : String(value);

/** One command's usage and options, rendered from the real CLI (see `bun run generate`). */
export function CliReference({ command: name }: { command: string }) {
  const command = commands.find((c) => c.name === name);
  if (!command) throw new Error(`Unknown CLI command in docs: ${name}`);

  return (
    <div className="not-prose my-4">
      <p className="mb-3 text-sm text-fd-muted-foreground">
        {command.description}
        {command.aliases.length > 0 && (
          <>
            {' '}
            (alias: <code className="font-mono">{command.aliases.join(', ')}</code>)
          </>
        )}
      </p>
      <pre className="mb-4 overflow-x-auto rounded-lg border bg-fd-card px-4 py-3 font-mono text-sm">
        <span className="select-none text-fd-primary">$ </span>
        {usage(command)}
      </pre>
      {command.options.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-fd-muted/50 text-xs uppercase tracking-wide text-fd-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Option</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {command.options.map((option) => (
                <tr key={option.flags}>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-[13px] text-fd-primary">
                    {option.flags}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {option.description}
                    {option.choices && (
                      <span className="text-fd-muted-foreground">
                        {' '}
                        One of {option.choices.join(', ')}.
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top font-mono text-[13px] text-fd-muted-foreground">
                    {shown(option.default)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
