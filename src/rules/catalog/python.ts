import type { RuleDefinition } from './types.js';

export const pythonRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: '__pycache__',
    categories: ['python'],
    description: 'Python bytecode cache',
  },
  {
    kind: 'always-safe',
    name: '.venv',
    categories: ['python'],
    description: 'Virtual environment',
  },
  {
    kind: 'always-safe',
    name: 'venv',
    categories: ['python'],
    description: 'Virtual environment',
  },
  {
    kind: 'always-safe',
    name: '.pytest_cache',
    categories: ['python'],
    description: 'pytest cache',
  },
  {
    kind: 'always-safe',
    name: '.mypy_cache',
    categories: ['python'],
    description: 'mypy type-checker cache',
  },
  {
    kind: 'always-safe',
    name: '.ruff_cache',
    categories: ['python'],
    description: 'Ruff linter cache',
  },
  {
    kind: 'always-safe',
    name: '.tox',
    categories: ['python'],
    description: 'tox test environments',
  },
  {
    kind: 'always-safe',
    name: '.eggs',
    categories: ['python'],
    description: 'setuptools egg build cache',
  },
  {
    kind: 'always-safe',
    name: 'htmlcov',
    categories: ['python'],
    description: 'coverage.py HTML report output',
  },
  {
    kind: 'always-safe',
    name: '.hypothesis',
    categories: ['python'],
    description: 'Hypothesis property-testing cache',
  },
  {
    kind: 'always-safe',
    name: '.ipynb_checkpoints',
    categories: ['python'],
    description: 'Jupyter notebook checkpoint snapshots',
  },
];
