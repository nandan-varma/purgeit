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
      depth: undefined,
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
