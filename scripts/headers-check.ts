/**
 * The command behind `npm run headers:live`: the deployed page's own response read, as a browser gets it, and held to
 * the rules in `headers.ts`, since a header set in the wrong place, or stripped on the way, is not sent. The page is
 * https://golf.ooer.com/ unless another address is given. Run after a deploy; it needs the network.
 */
import { headerProblems } from './headers';

const url = process.argv[2] ?? 'https://golf.ooer.com/';
const response = await fetch(url, { redirect: 'follow' });
const sent: Record<string, string> = {};
response.headers.forEach((value, name) => (sent[name] = value));
const problems = headerProblems(sent, url.startsWith('https:'));
console.log(
  `headers: ${url}, ${response.status}, ${problems.length ? problems.length + ' wrong' : 'all as they should be'}`,
);
for (const p of problems) console.error(`  ${p}`);
process.exit(problems.length || !response.ok ? 1 : 0);
