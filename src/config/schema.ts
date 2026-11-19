import { z } from 'zod';

import { WhenSchema } from '../rules/condition.js';
import { isDuration, isSize } from '../units.js';

const ruleName = z
  .string()
  .min(1)
  .refine((value) => !/[\\/]/.test(value), 'must be a directory name, not a path');

const duration = z
  .string()
  .refine(isDuration, 'must be a duration such as 90m, 36h, 7d or 2w (0 disables)');
const size = z.string().refine(isSize, 'must be a size such as 500KB, 10MB or 1GB');

const GatedRuleSchema = z.strictObject({
  name: ruleName,
  when: WhenSchema.describe('Proof, in the directory beside it, that the directory is generated.'),
  description: z.string().optional(),
});

const MarkerRuleSchema = z.strictObject({
  name: z.string().min(1).describe('Identifies the rule in reports and `only` selections.'),
  file: z.string().min(1).describe('A file inside the directory that tags it as a cache.'),
  signature: z.string().min(1).describe('Text the marker file must begin with.'),
  description: z.string().optional(),
});

export const ConfigSchema = z
  .strictObject({
    $schema: z.string().optional(),
    defaults: z.boolean().default(true).describe("Start from purgeit's built-in rules."),
    safe: z
      .array(ruleName)
      .default([])
      .describe('Directory names that are safe to delete wherever they appear.'),
    gated: z
      .array(GatedRuleSchema)
      .default([])
      .describe('Directory names that are only deletable when `when` holds beside them.'),
    markers: z.array(MarkerRuleSchema).default([]),
    disable: z.array(z.string()).default([]).describe('Built-in rule names to switch off.'),
    ignore: z.array(ruleName).default([]).describe('Directory names that are never entered.'),
    exclude: z
      .array(z.string().min(1))
      .default([])
      .describe('Globs, relative to each scan root, that are skipped entirely.'),
    groups: z
      .record(z.string(), z.array(z.string()).min(1))
      .default({})
      .describe('Named sets of rules, selectable with `--only <group>`.'),
    minAge: duration.optional().describe('Only offer artifacts untouched for at least this long.'),
    minSize: size.optional().describe('Only offer artifacts at least this large.'),
    includeEmpty: z
      .boolean()
      .optional()
      .describe('Offer artifacts that contain no files (normally dropped).'),
    dormantAfter: duration
      .optional()
      .describe(
        'A project untouched for this long is dormant (default 30d). Drives sorting, the interactive R key and --stale.',
      ),
    depth: z.number().int().positive().optional().describe('Never descend deeper than this.'),
  })
  .superRefine((config, ctx) => {
    const safe = new Set(config.safe);
    for (const rule of config.gated) {
      if (safe.has(rule.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['gated'],
          message: `"${rule.name}" is listed as both safe and gated`,
        });
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;

/** Identity helper that types a `purgeit.config.ts`. */
export function defineConfig(config: ConfigInput): ConfigInput {
  return config;
}
