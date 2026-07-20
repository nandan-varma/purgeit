/**
 * Directory names that are unconditionally safe to delete wherever found in
 * a project tree. Ported 1:1 from CLEANUP.sh's ALWAYS_SAFE_NAMES. Once
 * matched during a scan, the walker never descends further into these (no
 * point looking for node_modules inside node_modules).
 */
export const ALWAYS_SAFE_NAMES: readonly string[] = [
  'node_modules',
  '.next',
  '.nuxt',
  '.astro',
  '.docusaurus',
  '.angular',
  '.svelte-kit',
  'dist',
  'out',
  '.turbo',
  '.cache',
  '.swc',
  '.vite',
  'coverage',
  '.nyc_output',
  '.parcel-cache',
  '.expo',
  'storybook-static',
  'playwright-report',
  'test-results',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.build',
  'DerivedData',
];

/**
 * Directory names too generic to trust blindly wherever found — only
 * deletable when a sibling manifest in the same parent directory proves the
 * dir is really generated output. See gate-conditions.ts for the predicates.
 * Ported 1:1 from CLEANUP.sh's GATED_NAMES.
 */
export const GATED_NAMES: readonly string[] = ['Pods', 'build', '.gradle', 'bin', 'obj'];

/** VCS metadata directories never descended into while scanning. */
export const PRUNE_META_NAMES: readonly string[] = ['.git', '.hg', '.svn'];
