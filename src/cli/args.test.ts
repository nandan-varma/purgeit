import { describe, expect, it } from 'vitest';
import { parseCliArgs } from './args.js';

describe('parseCliArgs', () => {
  it('returns "help" for -h/--help', () => {
    expect(parseCliArgs(['--help'])).toBe('help');
    expect(parseCliArgs(['-h'])).toBe('help');
  });

  it('returns "version" for -V/--version', () => {
    expect(parseCliArgs(['--version'])).toBe('version');
    expect(parseCliArgs(['-V'])).toBe('version');
  });

  it('defaults directory to "." and applies all defaults', () => {
    const parsed = parseCliArgs([]);
    expect(parsed).toEqual({
      directory: '.',
      full: false,
      project: undefined,
      exclude: [],
      targets: [],
      minSize: undefined,
      minAge: undefined,
      maxAge: undefined,
      depth: undefined,
      provider: 'local',
      region: undefined,
      awsProfile: undefined,
      gcpProject: undefined,
      tags: [],
      withCost: false,
      configPath: undefined,
      noConfig: false,
      noGated: false,
      sort: 'size',
      ascending: false,
      dryRun: false,
      delete: false,
      yes: false,
      json: false,
      tui: false,
      headless: false,
      concurrency: 8,
      color: undefined,
    });
  });

  it('parses a positional directory', () => {
    const parsed = parseCliArgs(['~/dev']);
    expect(parsed).not.toBe('help');
    expect(parsed).not.toBe('version');
    if (typeof parsed !== 'string') expect(parsed.directory).toBe('~/dev');
  });

  it('throws on an unexpected extra positional', () => {
    expect(() => parseCliArgs(['a', 'b'])).toThrow(/unexpected extra argument/);
  });

  it('parses repeatable --exclude', () => {
    const parsed = parseCliArgs(['--exclude', '*.log', '--exclude', 'tmp/**']);
    expect(parsed).not.toBe('help');
    expect(parsed).not.toBe('version');
    if (typeof parsed !== 'string') expect(parsed.exclude).toEqual(['*.log', 'tmp/**']);
  });

  it('splits and trims comma-separated --targets', () => {
    const parsed = parseCliArgs(['--targets', 'node_modules, dist ,, python']);
    if (typeof parsed !== 'string')
      expect(parsed.targets).toEqual(['node_modules', 'dist', 'python']);
  });

  it('parses --min-age and --max-age as pass-through strings', () => {
    const parsed = parseCliArgs(['--min-age', '7d', '--max-age', '30d']);
    if (typeof parsed !== 'string') {
      expect(parsed.minAge).toBe('7d');
      expect(parsed.maxAge).toBe('30d');
    }
  });

  it('parses --provider aws with its cloud-only flags', () => {
    const parsed = parseCliArgs([
      '--provider',
      'aws',
      '--region',
      'us-east-1',
      '--aws-profile',
      'dev',
      '--tag',
      'env=dev',
      '--tag',
      'team=platform',
      '--with-cost',
    ]);
    if (typeof parsed !== 'string') {
      expect(parsed.provider).toBe('aws');
      expect(parsed.region).toBe('us-east-1');
      expect(parsed.awsProfile).toBe('dev');
      expect(parsed.gcpProject).toBeUndefined();
      expect(parsed.tags).toEqual([
        { key: 'env', value: 'dev' },
        { key: 'team', value: 'platform' },
      ]);
      expect(parsed.withCost).toBe(true);
    }
  });

  it('parses --provider gcp with --gcp-project', () => {
    const parsed = parseCliArgs(['--provider', 'gcp', '--gcp-project', 'my-project']);
    if (typeof parsed !== 'string') {
      expect(parsed.provider).toBe('gcp');
      expect(parsed.gcpProject).toBe('my-project');
    }
  });

  it('rejects an invalid --provider value', () => {
    expect(() => parseCliArgs(['--provider', 'bogus'])).toThrow(/invalid --provider/);
  });

  it('rejects local-only flags combined with --provider aws', () => {
    expect(() => parseCliArgs(['--provider', 'aws', '/tmp'])).toThrow(/directory argument/);
    expect(() => parseCliArgs(['--provider', 'aws', '--full'])).toThrow(/--full/);
    expect(() => parseCliArgs(['--provider', 'aws', '--project', 'x'])).toThrow(/--project/);
    expect(() => parseCliArgs(['--provider', 'aws', '--depth', '2'])).toThrow(/--depth/);
    expect(() => parseCliArgs(['--provider', 'aws', '--targets', 'dist'])).toThrow(/--targets/);
    expect(() => parseCliArgs(['--provider', 'aws', '--min-size', '10MB'])).toThrow(/--min-size/);
    expect(() => parseCliArgs(['--provider', 'aws', '--exclude', '*.log'])).toThrow(/--exclude/);
    expect(() => parseCliArgs(['--provider', 'aws', '--no-gated'])).toThrow(/--no-gated/);
    expect(() => parseCliArgs(['--provider', 'aws', '--tui'])).toThrow(/--tui/);
  });

  it('rejects cloud-only flags with the default local provider', () => {
    expect(() => parseCliArgs(['--region', 'us-east-1'])).toThrow(/--region requires/);
    expect(() => parseCliArgs(['--aws-profile', 'dev'])).toThrow(/--aws-profile requires/);
    expect(() => parseCliArgs(['--gcp-project', 'x'])).toThrow(/--gcp-project requires/);
    expect(() => parseCliArgs(['--tag', 'env=dev'])).toThrow(/--tag requires/);
    expect(() => parseCliArgs(['--with-cost'])).toThrow(/--with-cost requires/);
  });

  it('rejects --aws-profile with --provider gcp and --gcp-project with --provider aws', () => {
    expect(() =>
      parseCliArgs(['--provider', 'gcp', '--tag', 'env=dev', '--aws-profile', 'dev']),
    ).toThrow(/--aws-profile requires --provider aws/);
    expect(() =>
      parseCliArgs(['--provider', 'aws', '--tag', 'env=dev', '--gcp-project', 'x']),
    ).toThrow(/--gcp-project requires --provider gcp/);
  });

  it('rejects --region with --provider gcp (gcp always scans every zone/location)', () => {
    expect(() =>
      parseCliArgs(['--provider', 'gcp', '--tag', 'env=dev', '--region', 'us-central1']),
    ).toThrow(/--region requires --provider aws/);
  });

  it('rejects --with-cost with --provider gcp (not yet supported)', () => {
    expect(() => parseCliArgs(['--provider', 'gcp', '--tag', 'env=dev', '--with-cost'])).toThrow(
      /--with-cost is not yet supported for --provider gcp/,
    );
  });

  it('rejects a malformed --tag', () => {
    expect(() => parseCliArgs(['--provider', 'aws', '--tag', 'no-equals-sign'])).toThrow(
      /invalid --tag/,
    );
    expect(() => parseCliArgs(['--provider', 'aws', '--tag', '=value'])).toThrow(/invalid --tag/);
    expect(() => parseCliArgs(['--provider', 'aws', '--tag', 'key='])).toThrow(/invalid --tag/);
  });

  it('parses --depth and --concurrency as positive integers', () => {
    const parsed = parseCliArgs(['--depth', '3', '--concurrency', '4']);
    if (typeof parsed !== 'string') {
      expect(parsed.depth).toBe(3);
      expect(parsed.concurrency).toBe(4);
    }
  });

  it('rejects a non-integer --depth', () => {
    expect(() => parseCliArgs(['--depth', 'abc'])).toThrow(/invalid --depth/);
  });

  it('rejects a zero or negative --concurrency', () => {
    expect(() => parseCliArgs(['--concurrency', '0'])).toThrow(/invalid --concurrency/);
  });

  it('rejects an invalid --sort value', () => {
    expect(() => parseCliArgs(['--sort', 'bogus'])).toThrow(/invalid --sort/);
  });

  it('accepts each valid --sort value', () => {
    for (const key of ['size', 'path', 'name']) {
      const parsed = parseCliArgs(['--sort', key]);
      if (typeof parsed !== 'string') expect(parsed.sort).toBe(key);
    }
  });

  it('rejects --tui combined with --headless', () => {
    expect(() => parseCliArgs(['--tui', '--headless'])).toThrow(/--tui and --headless/);
  });

  it('rejects --color combined with --no-color', () => {
    expect(() => parseCliArgs(['--color', '--no-color'])).toThrow(/--color and --no-color/);
  });

  it('rejects --config combined with --no-config', () => {
    expect(() => parseCliArgs(['--config', 'x.json', '--no-config'])).toThrow(
      /--config and --no-config/,
    );
  });

  it('resolves color: true/false/undefined from --color/--no-color/neither', () => {
    const withColor = parseCliArgs(['--color']);
    const withoutColor = parseCliArgs(['--no-color']);
    const neither = parseCliArgs([]);
    if (typeof withColor !== 'string') expect(withColor.color).toBe(true);
    if (typeof withoutColor !== 'string') expect(withoutColor.color).toBe(false);
    if (typeof neither !== 'string') expect(neither.color).toBeUndefined();
  });

  it('parses -y/--yes, -d/--directory short flags', () => {
    const parsed = parseCliArgs(['-y', '-d', '/tmp/x']);
    if (typeof parsed !== 'string') {
      expect(parsed.yes).toBe(true);
      expect(parsed.directory).toBe('/tmp/x');
    }
  });

  it('rejects passing the directory both positionally and via --directory', () => {
    expect(() => parseCliArgs(['~/dev', '--directory', '/tmp/x'])).toThrow(
      /either a positional argument or --directory/,
    );
  });
});
