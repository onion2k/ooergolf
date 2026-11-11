/**
 * What a change reaches, for `npm run check:change`: each kind of file held to the gates it can move and no fewer, and
 * anything unknown held to everything. A gate wrongly left out here passes in silence, so each rule has its case.
 */
import { describe, expect, it } from 'vitest';
import { NODE_GATES, PAGE_SPECS, reach, type Inputs } from '../scripts/reach';

const SPECS = ['hud', 'title', 'progress', 'tournament-hud', 'look', 'sound', 'pwa', 'game', 'biome', 'models', 'perf'];
const none = new Set<string>();
const INPUTS: Inputs = {
  gates: {
    fuzz: new Set(['src/game.ts', 'src/golf.ts', 'scripts/fuzzer.ts', 'scripts/fuzz.ts']),
    determinism: new Set(['src/game.ts', 'src/golf.ts']),
    'leaks:check': new Set(['src/game.ts', 'src/golf.ts', 'scripts/leaks.ts']),
    'pace:check': new Set(['src/game.ts', 'src/golf.ts', 'src/autopilot.ts']),
    'daily:check': new Set(['src/game.ts', 'src/golf.ts', 'src/autopilot.ts', 'src/daily.ts']),
    bench: new Set(['src/physics.ts']),
  },
  page: new Set(['src/main.ts', 'src/game.ts', 'src/golf.ts', 'src/hud.ts', 'src/scene.ts', 'src/trophywords.ts']),
  showcase: new Set(['src/showcase.ts', 'src/models/kicker.ts']),
};
const here = () => true;
const pictureOf = (p: string) => (p === 'menu.png' ? 'look' : undefined);
const of = (...changed: string[]) => reach(changed, INPUTS, here, SPECS, pictureOf);

describe('what a change reaches', () => {
  it('holds words nobody runs to the quick check alone', () => {
    const r = of('AGENTS.md', 'HOW-IT-WORKS.md', '.claude/skills/bug/SKILL.md');
    expect(r).toMatchObject({ whole: null, gates: [], smoke: [] });
    expect(r.why).toHaveLength(3);
  });

  it("holds the page's words and panels to the page's own specs, and to no Node gate", () => {
    for (const path of ['index.html', 'src/hud.ts', 'src/trophywords.ts']) {
      const r = of(path);
      expect(r.whole, path).toBe(null);
      expect(r.gates, path).toEqual([]);
      expect(r.smoke, path).toEqual([...PAGE_SPECS].sort());
    }
  });

  it('holds what draws the world to all of smoke', () => {
    expect(of('src/scene.ts')).toMatchObject({ whole: null, gates: [], smoke: 'all' });
    expect(of('src/main.ts').smoke).toBe('all');
  });

  it('holds the game to every gate whose bundle it is in, and to all of smoke', () => {
    const r = of('src/game.ts');
    expect(r.gates).toEqual(['fuzz', 'determinism', 'leaks:check', 'pace:check', 'daily:check']);
    expect(r.smoke).toBe('all');
    expect(of('src/physics.ts').gates).toEqual(['bench']);
  });

  it("holds a gate's own script to that gate, and a baseline to the gate that reads it", () => {
    expect(of('scripts/fuzzer.ts')).toMatchObject({ gates: ['fuzz'], smoke: [] });
    expect(of('scripts/pace-baseline.json')).toMatchObject({ gates: ['pace:check'], smoke: [] });
    expect(of('scripts/bench-baseline.json').gates).toEqual(['bench']);
  });

  it('holds a smoke spec to itself, a picture to the spec that names it, and a smoke helper to every spec', () => {
    expect(of('smoke/hud.spec.ts')).toMatchObject({ gates: [], smoke: ['hud'] });
    expect(of('smoke/screens/menu.png').smoke).toEqual(['look']);
    expect(of('smoke/screens/unknown.png').smoke).toBe('all');
    expect(of('smoke/game.ts').smoke).toBe('all');
    expect(of('smoke/perf-baseline.json').smoke).toBe('all');
  });

  it("holds a model of the showcase alone to the models' spec", () => {
    expect(of('src/models/kicker.ts')).toMatchObject({ gates: [], smoke: ['models'] });
  });

  it('leaves a test file to the test runner', () => {
    expect(of('test/game.test.ts')).toMatchObject({ whole: null, gates: [], smoke: [] });
  });

  it('holds a config, the lockfile or a hook to the whole check', () => {
    for (const path of [
      'package.json',
      'package-lock.json',
      'vitest.config.ts',
      'tsconfig.node.json',
      '.githooks/pre-commit',
    ]) {
      const r = of(path, 'AGENTS.md');
      expect(r.whole, path).toContain(path);
      expect(r.gates, path).toEqual([...NODE_GATES]);
      expect(r.smoke, path).toBe('all');
    }
  });

  it('holds a source file that is gone to the whole check, since no bundle can say what used it', () => {
    const r = reach(['src/old.ts'], INPUTS, () => false, SPECS, pictureOf);
    expect(r.whole).toContain('src/old.ts');
  });

  it('holds a file of no kind it knows to the whole check, and never to nothing', () => {
    expect(of('src/unreached.ts').whole).toContain('no kind');
    expect(of('strange.bin').whole).toContain('no kind');
    expect(reach(['public/icons/a.png'], { ...INPUTS, page: none }, here, SPECS, pictureOf).smoke).toBe('all');
  });

  it('takes the widest of several files', () => {
    const r = of('AGENTS.md', 'src/hud.ts', 'scripts/fuzzer.ts', 'smoke/screens/menu.png');
    expect(r.gates).toEqual(['fuzz']);
    expect(r.smoke).toEqual([...PAGE_SPECS].sort());
    expect(of('src/hud.ts', 'src/scene.ts').smoke).toBe('all');
  });
});
