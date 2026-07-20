import type { Gate, GateContext } from '../types.js';

function anySiblingFile(ctx: GateContext, names: readonly string[]): boolean {
  return names.some((name) => ctx.siblingFile(name));
}

function anySiblingGlob(ctx: GateContext, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => ctx.siblingGlob(pattern));
}

/** `Pods/` is deletable only next to a `Podfile` — ports gate_allows()'s Pods case. */
export const podsGate: Gate = (ctx) => ctx.siblingFile('Podfile');

/**
 * `build/` is too generic a name to trust on its own — ports gate_allows()'s
 * build case: deletable only next to a manifest that plausibly produces it
 * (CocoaPods, Xcode, CMake, Node, Python, or Gradle).
 */
export const buildGate: Gate = (ctx) =>
  ctx.siblingFile('Podfile') ||
  anySiblingGlob(ctx, ['*.xcodeproj', '*.xcworkspace']) ||
  anySiblingFile(ctx, [
    'CMakeLists.txt',
    'package.json',
    'pyproject.toml',
    'requirements.txt',
    'build.gradle',
    'build.gradle.kts',
  ]);

/** `.gradle/` is deletable only next to a Gradle project/settings file. */
export const gradleGate: Gate = (ctx) =>
  anySiblingFile(ctx, [
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
  ]);

/** `bin/`/`obj/` are deletable only next to a .NET project/solution file. */
export const binObjGate: Gate = (ctx) => anySiblingGlob(ctx, ['*.csproj', '*.sln']);

/** Default GATED_NAMES → Gate mapping, ported from CLEANUP.sh's `gate_allows()`. */
export const DEFAULT_GATES: ReadonlyMap<string, Gate> = new Map([
  ['Pods', podsGate],
  ['build', buildGate],
  ['.gradle', gradleGate],
  ['bin', binObjGate],
  ['obj', binObjGate],
]);
