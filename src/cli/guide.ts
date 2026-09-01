/**
 * The canonical public operating guide. Keep CLI help, agent instructions and
 * the documentation site linked to this module instead of maintaining copies.
 */
export const AGENT_INSTRUCTIONS = `# purgeit operating guide

purgeit finds regenerable development artifacts. A scan never changes disk.
Use this protocol for humans and agents alike:

1. Run \`purgeit scan <directory> --format json\` and inspect \`summary\`,
   \`diagnostics\`, and \`entries\`.
2. Narrow the result with \`--project\`, \`--targets\`, \`--include\`, age,
   size, or exclusion filters. Never infer that every scan result is wanted.
3. Run \`purgeit plan <directory> --include <path> --output plan.json\` to
   record the exact approved entries.
4. Run \`purgeit apply --plan plan.json\`. It revalidates every entry before
   deletion and skips changed or no-longer-matching paths. \`--yes\` is the
   only way to bypass the final confirmation.

Machine contract: \`--format json\` writes exactly one versioned JSON document
to stdout; diagnostics are included in that document and human diagnostics go
to stderr. \`--format jsonl\` streams versioned events. A successful empty scan
exits 0. Exit 1 means an apply was partial or failed; 2 means invalid input or
an environment error.`;

export const AGENT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'purgeit scan report',
  type: 'object',
  required: ['schemaVersion', 'status', 'root', 'summary', 'entries', 'diagnostics'],
  properties: {
    schemaVersion: { const: 1 },
    status: { enum: ['completed'] },
    root: { type: 'string' },
    summary: {
      type: 'object',
      required: ['entryCount', 'totalBytes', 'elapsedMs'],
      properties: {
        entryCount: { type: 'integer', minimum: 0 },
        totalBytes: { type: 'integer', minimum: 0 },
        elapsedMs: { type: 'number', minimum: 0 },
      },
    },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'relativePath', 'project', 'ruleName', 'kind', 'size', 'lastModified'],
      },
    },
    diagnostics: { type: 'array' },
  },
} as const;

export const USAGE = `Usage: purgeit [command] [directory] [options]

Commands:
  scan [directory]       Find artifacts without changing disk (default outside a TTY)
  tui [directory]        Open the interactive review UI (default in a TTY)
  plan [directory]       Write an explicit deletion plan; requires --include
  apply --plan <file>    Revalidate and apply a previously written plan
  agent <instructions|schema>

Use 'purgeit agent instructions' for the complete, version-matched protocol
for people, CI, and AI agents.`;
