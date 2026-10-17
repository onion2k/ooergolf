/**
 * Nothing in src/ imports in a circle (guardrails/checks/structure.md; what may import what is lint's, in
 * eslint.config.js). Two modules that need each other are one module, or a third is missing. The imports are read with
 * TypeScript's own parser and resolved as the compiler resolves them; an import of types alone is left out, since it is
 * gone when the game runs.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Every module reached from each, by an import that is not of types alone: src-relative paths. */
function importsOf(root: string): Map<string, string[]> {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts') && !path.endsWith('.d.ts')) files.push(path);
    }
  })(root);
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
    const to: string[] = [];
    for (const node of source.statements) {
      let spec: ts.Expression | undefined;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const typesAlone =
          clause?.isTypeOnly === true ||
          (clause !== undefined &&
            clause.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((e) => e.isTypeOnly));
        if (!typesAlone) spec = node.moduleSpecifier;
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) spec = node.moduleSpecifier;
      if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith('.')) continue;
      const resolved = ts.resolveModuleName(spec.text, file, options, ts.sys).resolvedModule?.resolvedFileName;
      if (resolved && resolved.endsWith('.ts')) to.push(relative(root, resolved));
    }
    graph.set(relative(root, file), to);
  }
  return graph;
}

/** Each circle of imports, once, as the path round it from where it was first met. */
function cyclesOf(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const done = new Set<string>(),
    onPath = new Set<string>(),
    path: string[] = [],
    found: string[][] = [];
  const visit = (node: string) => {
    done.add(node);
    onPath.add(node);
    path.push(node);
    for (const next of graph.get(node) ?? []) {
      if (onPath.has(next)) found.push([...path.slice(path.indexOf(next)), next]);
      else if (!done.has(next)) visit(next);
    }
    path.pop();
    onPath.delete(node);
  };
  for (const node of [...graph.keys()].sort()) if (!done.has(node)) visit(node);
  return found;
}

describe('the structure of src', () => {
  it('finds a circle of imports when there is one, and none when there is not', () => {
    const line = new Map([
      ['game.ts', ['arena.ts']],
      ['arena.ts', ['tile.ts']],
      ['tile.ts', []],
    ]);
    expect(cyclesOf(line)).toEqual([]);
    const round = new Map([
      ['game.ts', ['arena.ts']],
      ['arena.ts', ['zones.ts']],
      ['zones.ts', ['arena.ts']],
    ]);
    expect(cyclesOf(round)).toEqual([['arena.ts', 'zones.ts', 'arena.ts']]);
  });

  it('reads every module and its imports, and leaves out an import of types alone', () => {
    const graph = importsOf('src');
    expect(graph.size, 'the modules read').toBeGreaterThan(100);
    expect(graph.get('game.ts'), 'the game imports the layout').toContain('arena.ts');
    expect(graph.get('zones.ts'), 'the zones take only the layout’s type from arena.ts').not.toContain('arena.ts');
    expect(graph.get('models/shapes.ts'), 'a module in a folder, resolved').toContain('meshes.ts');
  });

  it('has nothing that imports in a circle', () => {
    expect(cyclesOf(importsOf('src')).map((c) => c.join(' -> '))).toEqual([]);
  });
});
