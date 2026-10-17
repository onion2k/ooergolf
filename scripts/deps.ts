/**
 * What the game takes in from others, held to the threshold and the licences `AGENTS.md` names (guardrails/checks/dependencies.md).
 *
 *   npm run audit       the installed tree's known advisories: high and critical fail, moderate and low are said
 *   npm run licences    every package that ships, its licence on the allowed list or named as not
 *
 * The judgements are here, with tests of their own (`test/deps.test.ts`); `deps-check.ts` runs them.
 *
 * The audit is npm's own, run here for its report and judged by `auditVerdict`, since its exit code alone cannot be
 * trusted: an audit that reached no registry has passed in silence on some versions of some tools, and a check that
 * did not run must fail. It needs the network, so it is not in the hook or the full check, and runs in CI.
 *
 * The licences are read from the installed packages that ship, which the lockfile tells from the dev ones: what a
 * player downloads is only those. The kit's tool for this, license-checker-rseidelsohn 5, asks for Node 24 and npm 11,
 * which this machine has not got, and what it would hold is a few lines here: a lockfile walked and a list compared.
 */
/** The licences a package that ships may have; anything else is asked about by name, never added to make the check pass. */
export const ALLOWED = ['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Apache-2.0', '0BSD', 'Unlicense'];

/** The severities that fail the audit, highest first; the rest are said and pass. */
export const FAILS = ['critical', 'high'];

/**
 * Whether an SPDX expression is allowed: one licence on the list, any side of an OR, every side of an AND. Only the
 * shapes npm packages use are read (a name, OR, AND, brackets); anything else is not allowed, and so is asked about.
 */
export function allowed(expression: string | undefined, list: readonly string[] = ALLOWED): boolean {
  if (!expression) return false;
  const e = expression.trim().replace(/^\((.*)\)$/, '$1');
  if (/\bOR\b/.test(e)) return e.split(/\s+OR\s+/).some((part) => allowed(part, list));
  if (/\bAND\b/.test(e)) return e.split(/\s+AND\s+/).every((part) => allowed(part, list));
  return list.includes(e);
}

/** A package that ships, where it is installed, and the licence its own package.json says. */
export interface Shipped {
  path: string;
  licence: string | undefined;
}

/**
 * The packages that ship, from the lockfile's own marks: every package that is not `dev` (nor only a dev one's
 * optional), each read for its licence through `read`, which a test hands its own.
 */
export function shipped(
  lock: { packages: Record<string, { dev?: boolean; devOptional?: boolean }> },
  read: (path: string) => string | undefined,
): Shipped[] {
  return Object.entries(lock.packages)
    .filter(([path, entry]) => path !== '' && !entry.dev && !entry.devOptional)
    .map(([path]) => ({ path, licence: read(path) }));
}

/** Each package that ships whose licence is not allowed, or says none, by name. */
export function licenceProblems(packages: readonly Shipped[], list: readonly string[] = ALLOWED): string[] {
  return packages
    .filter((p) => !allowed(p.licence, list))
    .map((p) => `${p.path.replace(/^node_modules\//, '')}: ${p.licence ?? 'no licence said'}`);
}

/** What an audit came to: whether it fails, and the lines that say why. */
export interface AuditVerdict {
  fails: boolean;
  lines: string[];
}

/**
 * npm's `audit --json`, judged. Not a report (no registry reached, an error, nothing at all) fails, since a check that
 * did not run passes in silence; a report fails on any advisory of a severity in `FAILS`, naming each package, and says
 * the rest.
 */
export function auditVerdict(json: string): AuditVerdict {
  let report: unknown;
  try {
    report = JSON.parse(json);
  } catch {
    return { fails: true, lines: ['the audit gave no report: it may not have reached the registry'] };
  }
  const counts = (report as { metadata?: { vulnerabilities?: Record<string, number> } } | null)?.metadata
    ?.vulnerabilities;
  const found = (report as { vulnerabilities?: Record<string, { severity: string }> } | null)?.vulnerabilities;
  if (!counts || typeof counts !== 'object' || !found || typeof found !== 'object')
    return { fails: true, lines: ['the audit gave no report: it may not have reached the registry'] };
  const lines: string[] = [];
  let fails = false;
  for (const [name, v] of Object.entries(found).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const failing = FAILS.includes(v.severity);
    fails ||= failing;
    lines.push(`${failing ? 'fails' : 'said'}: ${name}, ${v.severity}`);
  }
  lines.push(
    `${Object.keys(found).length} advisories: ${['critical', 'high', 'moderate', 'low', 'info'].map((s) => `${counts[s] ?? 0} ${s}`).join(', ')}`,
  );
  return { fails, lines };
}
