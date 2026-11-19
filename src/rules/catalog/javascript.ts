import type { RuleDefinition } from './types.js';

/** JavaScript/TypeScript ecosystem: npm/yarn/pnpm, common frameworks, and legacy package managers. */
export const javascriptRules: readonly RuleDefinition[] = [
  {
    kind: 'safe',
    name: 'node_modules',
    categories: ['javascript-typescript'],
    description: 'npm / yarn / pnpm dependencies',
  },
  {
    kind: 'safe',
    name: '.next',
    categories: ['javascript-typescript'],
    description: 'Next.js build output',
  },
  {
    kind: 'safe',
    name: '.nuxt',
    categories: ['javascript-typescript'],
    description: 'Nuxt dev/type-generation cache',
  },
  {
    kind: 'safe',
    name: '.output',
    categories: ['javascript-typescript'],
    description: 'Nuxt 3 build output (Nitro)',
  },
  {
    kind: 'safe',
    name: '.astro',
    categories: ['javascript-typescript'],
    description: 'Astro build cache',
  },
  {
    kind: 'safe',
    name: '.docusaurus',
    categories: ['javascript-typescript'],
    description: 'Docusaurus build cache',
  },
  {
    kind: 'safe',
    name: '.angular',
    categories: ['javascript-typescript'],
    description: 'Angular CLI build cache',
  },
  {
    kind: 'safe',
    name: '.svelte-kit',
    categories: ['javascript-typescript'],
    description: 'SvelteKit build output',
  },
  {
    kind: 'safe',
    name: 'dist',
    categories: ['javascript-typescript'],
    description: "Generic build output (also used by many other ecosystems' bundlers)",
  },
  {
    kind: 'gated',
    name: 'out',
    categories: ['javascript-typescript'],
    description:
      'Build output (Next.js static export, IntelliJ and Gradle) — gated, because "out" is a common name for authored folders',
    when: [
      { file: 'package.json' },
      { file: 'pom.xml' },
      { file: 'build.gradle' },
      { file: 'build.gradle.kts' },
    ],
  },
  {
    kind: 'safe',
    name: '.turbo',
    categories: ['javascript-typescript'],
    description: 'Turborepo cache',
  },
  {
    kind: 'gated',
    name: '.cache',
    categories: ['javascript-typescript'],
    description:
      'Framework cache (Parcel, Gatsby, and others) — gated, because a bare .cache can hold anything',
    when: { file: 'package.json' },
  },
  {
    kind: 'safe',
    name: '.swc',
    categories: ['javascript-typescript'],
    description: 'SWC compiler cache',
  },
  {
    kind: 'safe',
    name: '.vite',
    categories: ['javascript-typescript'],
    description: 'Vite cache',
  },
  {
    kind: 'safe',
    name: '.parcel-cache',
    categories: ['javascript-typescript'],
    description: 'Parcel cache',
  },
  {
    kind: 'safe',
    name: '.expo',
    categories: ['javascript-typescript'],
    description: 'Expo cache',
  },
  {
    kind: 'safe',
    name: '.contentlayer',
    categories: ['javascript-typescript'],
    description: 'Contentlayer generated content cache',
  },
  {
    kind: 'safe',
    name: '.serverless',
    categories: ['javascript-typescript'],
    description: 'Serverless Framework packaged build artifacts',
  },
  {
    kind: 'safe',
    name: 'storybook-static',
    categories: ['javascript-typescript'],
    description: 'Storybook build output',
  },
  {
    kind: 'safe',
    name: 'playwright-report',
    categories: ['javascript-typescript'],
    description: 'Playwright HTML report output',
  },
  {
    kind: 'gated',
    name: 'test-results',
    categories: ['javascript-typescript'],
    description: 'Playwright test results',
    when: { file: 'package.json' },
  },
  {
    kind: 'gated',
    name: 'coverage',
    categories: ['javascript-typescript'],
    description:
      'Test coverage reports (Istanbul/nyc/Jest/Vitest, SimpleCov, coverage.py) — gated on a project manifest',
    when: [
      { file: 'package.json' },
      { file: 'Gemfile' },
      { file: 'pyproject.toml' },
      { file: 'setup.py' },
      { file: 'composer.json' },
      { file: 'pom.xml' },
      { file: 'build.gradle' },
      { file: 'build.gradle.kts' },
      { file: '.coveragerc' },
    ],
  },
  {
    kind: 'safe',
    name: '.nyc_output',
    categories: ['javascript-typescript'],
    description: 'nyc raw coverage data',
  },
  {
    kind: 'safe',
    name: 'bower_components',
    categories: ['javascript-typescript'],
    description: 'Bower dependencies (legacy)',
  },
  {
    kind: 'safe',
    name: 'jspm_packages',
    categories: ['javascript-typescript'],
    description: 'JSPM dependencies (legacy)',
  },
];
