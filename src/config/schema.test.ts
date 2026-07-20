import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { createGateContext } from '../rules/gate-context.js';
import { compileGateConditions, evaluateGate, isDeclarativeGatedRule } from './schema.js';

describe('isDeclarativeGatedRule', () => {
  it('distinguishes declarative from function-based rules', () => {
    expect(isDeclarativeGatedRule({ name: 'x', when: { file: 'a' } })).toBe(true);
    expect(isDeclarativeGatedRule({ name: 'x', gate: () => true })).toBe(false);
  });
});

describe('compileGateConditions', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('compiles a single `file` condition', () => {
    root = buildTree({ 'CMakeLists.txt': '', output: null });
    const gate = compileGateConditions({ file: 'CMakeLists.txt' });
    expect(gate(createGateContext(join(root, 'output')))).toBe(true);
  });

  it('compiles a `glob` condition', () => {
    root = buildTree({ 'App.custom': '', output: null });
    const gate = compileGateConditions({ glob: '*.custom' });
    expect(gate(createGateContext(join(root, 'output')))).toBe(true);
  });

  it('compiles a `grep` condition', () => {
    root = buildTree({ 'mkdocs.yml': 'site_name: x\n', output: null });
    const gate = compileGateConditions({ grep: { file: 'mkdocs.yml', pattern: '^site_name:' } });
    expect(gate(createGateContext(join(root, 'output')))).toBe(true);
  });

  it('ORs an array of conditions', () => {
    root = buildTree({ 'mkdocs.yml': 'site_name: x\n', output: null });
    const gate = compileGateConditions([{ file: 'does-not-exist' }, { file: 'mkdocs.yml' }]);
    expect(gate(createGateContext(join(root, 'output')))).toBe(true);
  });

  it('returns false when no condition matches', () => {
    root = buildTree({ output: null });
    const gate = compileGateConditions({ file: 'does-not-exist' });
    expect(gate(createGateContext(join(root, 'output')))).toBe(false);
  });
});

describe('evaluateGate', () => {
  it('builds a GateContext from a raw path and runs the gate', () => {
    const root = buildTree({ Podfile: 'platform :ios\n', Pods: null });
    try {
      expect(evaluateGate((ctx) => ctx.siblingFile('Podfile'), join(root, 'Pods'))).toBe(true);
    } finally {
      cleanupTree(root);
    }
  });
});
