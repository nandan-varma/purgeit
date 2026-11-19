import type { RuleDefinition } from './types.js';

export const pythonRules: readonly RuleDefinition[] = [
  {
    kind: 'safe',
    name: '__pycache__',
    categories: ['python'],
    description: 'Python bytecode cache',
  },
  {
    kind: 'safe',
    name: '.venv',
    categories: ['python'],
    description: 'Virtual environment',
  },
  {
    kind: 'safe',
    name: 'venv',
    categories: ['python'],
    description: 'Virtual environment',
  },
  {
    kind: 'safe',
    name: '.pytest_cache',
    categories: ['python'],
    description: 'pytest cache',
  },
  {
    kind: 'safe',
    name: '.mypy_cache',
    categories: ['python'],
    description: 'mypy type-checker cache',
  },
  {
    kind: 'safe',
    name: '.ruff_cache',
    categories: ['python'],
    description: 'Ruff linter cache',
  },
  {
    kind: 'safe',
    name: '.tox',
    categories: ['python'],
    description: 'tox test environments',
  },
  {
    kind: 'safe',
    name: '.nox',
    categories: ['python'],
    description: 'nox test sessions (virtualenvs)',
  },
  {
    kind: 'safe',
    name: '.eggs',
    categories: ['python'],
    description: 'setuptools egg build cache',
  },
  {
    kind: 'safe',
    name: 'htmlcov',
    categories: ['python'],
    description: 'coverage.py HTML report output',
  },
  {
    kind: 'safe',
    name: '.hypothesis',
    categories: ['python'],
    description: 'Hypothesis property-testing cache',
  },
  {
    kind: 'safe',
    name: '.ipynb_checkpoints',
    categories: ['python'],
    description: 'Jupyter notebook checkpoint snapshots',
  },
];
