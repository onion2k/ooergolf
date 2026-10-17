/** The headers the served game is sent with: the policy as built from the page, the file Netlify reads, and the judgement. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { headerProblems, headersFile, headersFor, policy, readHeadersFile, styleHashes } from '../scripts/headers';

const PAGE =
  '<html><head><style>body { margin: 0 }</style></head><body><script type="module" src="/a.js"></script></body></html>';
const HASH = `'sha256-${createHash('sha256').update('body { margin: 0 }').digest('base64')}'`;

describe('the headers the game is served with', () => {
  it("hashes the page's own inline styles, and lets them and nothing inline of scripts in", () => {
    expect(styleHashes(PAGE)).toEqual([HASH]);
    const csp = policy(styleHashes(PAGE));
    expect(csp).toContain(`style-src 'self' ${HASH}`);
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain('unsafe');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('writes the file Netlify reads, and reads it back to the same headers', () => {
    const headers = headersFor(PAGE);
    const file = headersFile(headers);
    expect(file.startsWith('/*\n  Content-Security-Policy: ')).toBe(true);
    expect(readHeadersFile(file)).toEqual(headers);
    expect(
      readHeadersFile(`/assets/*\n  Cache-Control: max-age=1\n${file}`),
      'only the headers for every path',
    ).toEqual(headers);
  });

  it("finds nothing wrong with the game's own, and asks for HSTS only over HTTPS", () => {
    expect(headerProblems(headersFor(PAGE), false)).toEqual([]);
    expect(headerProblems(headersFor(PAGE), true)).toEqual(['no Strict-Transport-Security']);
    expect(headerProblems({ ...headersFor(PAGE), 'Strict-Transport-Security': 'max-age=31536000' }, true)).toEqual([]);
  });

  it('names each fault: inline or evaluated scripts allowed, no frame-ancestors, and each header missing', () => {
    const good = headersFor(PAGE);
    const csp = good['Content-Security-Policy'];
    const without = (name: string) => Object.fromEntries(Object.entries(good).filter(([k]) => k !== name));
    expect(
      headerProblems(
        { ...good, 'Content-Security-Policy': csp.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") },
        false,
      ),
    ).toEqual(["the policy's script-src allows 'unsafe-inline'"]);
    expect(
      headerProblems(
        { ...good, 'Content-Security-Policy': csp.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'") },
        false,
      ),
    ).toEqual(["the policy's script-src allows 'unsafe-eval'"]);
    expect(
      headerProblems({ ...good, 'Content-Security-Policy': csp.replace("; frame-ancestors 'none'", '') }, false),
    ).toEqual(['the policy says nothing of frame-ancestors']);
    expect(headerProblems(without('Content-Security-Policy'), false)).toEqual(['no Content-Security-Policy']);
    expect(headerProblems(without('X-Frame-Options'), false)).toEqual(['no X-Frame-Options']);
    expect(headerProblems(without('X-Content-Type-Options'), false)).toEqual(['no X-Content-Type-Options: nosniff']);
    expect(headerProblems(without('Referrer-Policy'), false)).toEqual(['no Referrer-Policy']);
  });

  it('reads a header in any case, as a response gives them, and a script-src left to default-src', () => {
    const lower = Object.fromEntries(Object.entries(headersFor(PAGE)).map(([k, v]) => [k.toLowerCase(), v]));
    expect(headerProblems(lower, false)).toEqual([]);
    expect(
      headerProblems(
        { ...lower, 'content-security-policy': "default-src 'self' 'unsafe-inline'; frame-ancestors 'none'" },
        false,
      ),
    ).toEqual(["the policy's script-src allows 'unsafe-inline'"]);
  });
});
