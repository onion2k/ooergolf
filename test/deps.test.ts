/** The dependency checks' judgements: which licences are allowed, which packages ship, and what an audit came to. */
import { describe, expect, it } from 'vitest';
import { allowed, auditVerdict, licenceProblems, shipped } from '../scripts/deps';

/** npm's `audit --json` as it is shaped, with the advisories given. */
function report(found: Record<string, string>) {
  const counts: Record<string, number> = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const severity of Object.values(found)) counts[severity]++;
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(Object.entries(found).map(([name, severity]) => [name, { name, severity }])),
    metadata: { vulnerabilities: { ...counts, total: Object.keys(found).length } },
  });
}

describe('the licences', () => {
  it('allows a licence on the list, either side of an OR, and both sides of an AND, and nothing else', () => {
    expect(allowed('MIT')).toBe(true);
    expect(allowed('ISC')).toBe(true);
    expect(allowed('(MIT OR GPL-3.0)')).toBe(true);
    expect(allowed('GPL-3.0 OR Apache-2.0')).toBe(true);
    expect(allowed('MIT AND BSD-3-Clause')).toBe(true);
    expect(allowed('MIT AND GPL-3.0')).toBe(false);
    expect(allowed('GPL-3.0')).toBe(false);
    expect(allowed('SEE LICENSE IN LICENSE.md')).toBe(false);
    expect(allowed(undefined)).toBe(false);
    expect(allowed('')).toBe(false);
  });

  it('reads only the packages that ship, not the project itself nor a dev one', () => {
    const lock = {
      packages: {
        '': {},
        'node_modules/earcut': {},
        'node_modules/vitest': { dev: true },
        'node_modules/fsevents': { devOptional: true },
        'node_modules/artshape-render': {},
      },
    };
    const read = (path: string) => (path.endsWith('earcut') ? 'ISC' : 'MIT');
    expect(shipped(lock, read)).toEqual([
      { path: 'node_modules/earcut', licence: 'ISC' },
      { path: 'node_modules/artshape-render', licence: 'MIT' },
    ]);
  });

  it('names each package that ships with a licence not allowed, or none at all', () => {
    expect(
      licenceProblems([
        { path: 'node_modules/earcut', licence: 'ISC' },
        { path: 'node_modules/copyleft', licence: 'GPL-3.0' },
        { path: 'node_modules/nothing-said', licence: undefined },
      ]),
    ).toEqual(['copyleft: GPL-3.0', 'nothing-said: no licence said']);
  });
});

describe('the audit', () => {
  it('passes a report with nothing in it, and one with only moderate and low, saying them', () => {
    expect(auditVerdict(report({}))).toEqual({
      fails: false,
      lines: ['0 advisories: 0 critical, 0 high, 0 moderate, 0 low, 0 info'],
    });
    const some = auditVerdict(report({ 'left-pad': 'moderate', 'is-odd': 'low' }));
    expect(some.fails).toBe(false);
    expect(some.lines).toContain('said: left-pad, moderate');
  });

  it('fails a report with a high or a critical advisory, naming the package', () => {
    const high = auditVerdict(report({ 'source-map-js': 'high', 'left-pad': 'moderate' }));
    expect(high.fails).toBe(true);
    expect(high.lines).toContain('fails: source-map-js, high');
    expect(auditVerdict(report({ tinypool: 'critical' })).fails).toBe(true);
  });

  it('fails what is not a report: no registry reached, an error, or nothing at all', () => {
    for (const out of ['', 'npm error network request failed', '{"error":{"code":"ENOTFOUND"}}', 'null', '{}'])
      expect(auditVerdict(out), out).toEqual({
        fails: true,
        lines: ['the audit gave no report: it may not have reached the registry'],
      });
  });
});
