import schema from '@/generated/config.json';

type Property = {
  type?: string;
  items?: { type?: string };
  default?: unknown;
  description?: string;
};

const typeOf = (property: Property) =>
  property.type === 'array' ? `${property.items?.type ?? 'object'}[]` : (property.type ?? 'object');

/** Every config key, rendered from the JSON Schema that validates it (see `bun run generate`). */
export function ConfigReference() {
  const rows = Object.entries(schema.properties as Record<string, Property>).filter(
    ([key]) => key !== '$schema',
  );
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-fd-muted/50 text-xs uppercase tracking-wide text-fd-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Key</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Default</th>
            <th className="px-4 py-2 font-medium">Meaning</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(([key, property]) => (
            <tr key={key}>
              <td className="px-4 py-2.5 align-top font-mono text-[13px] text-fd-primary">{key}</td>
              <td className="px-4 py-2.5 align-top font-mono text-[13px]">{typeOf(property)}</td>
              <td className="px-4 py-2.5 align-top font-mono text-[13px] text-fd-muted-foreground">
                {property.default === undefined ? '' : JSON.stringify(property.default)}
              </td>
              <td className="px-4 py-2.5 align-top">{property.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
