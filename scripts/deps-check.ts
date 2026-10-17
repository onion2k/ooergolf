/**
 * The command behind `npm run audit` and `npm run licences`: the installed tree read, and judged by `deps.ts`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { auditVerdict, licenceProblems, shipped } from './deps';

function main(which: string | undefined) {
  if (which === 'licences') {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as Parameters<typeof shipped>[0];
    const packages = shipped(lock, (path) => {
      try {
        return (JSON.parse(readFileSync(`${path}/package.json`, 'utf8')) as { license?: string }).license;
      } catch {
        return undefined;
      }
    });
    const problems = licenceProblems(packages);
    console.log(`licences: ${packages.length} packages ship, ${problems.length} not allowed`);
    for (const p of problems) console.error(`  ${p}`);
    if (packages.length === 0) {
      console.error('licences: no package found that ships, which cannot be: the lockfile was not read');
      process.exit(1);
    }
    process.exit(problems.length ? 1 : 0);
  }
  if (which === 'audit') {
    let out = '';
    try {
      out = execFileSync('npm', ['audit', '--json', ...process.argv.slice(3)], { encoding: 'utf8' });
    } catch (error) {
      // npm audit exits 1 when it finds anything, with its report on stdout all the same
      out = (error as { stdout?: string }).stdout ?? '';
    }
    const verdict = auditVerdict(out);
    for (const line of verdict.lines) (verdict.fails ? console.error : console.log)(`audit: ${line}`);
    process.exit(verdict.fails ? 1 : 0);
  }
  console.error('deps: say audit or licences');
  process.exit(1);
}

main(process.argv[2]);
