/**
 * What the served game tells the browser to refuse (guardrails/checks/headers.md), said once: the build writes it into
 * `dist/_headers`, which Netlify serves the game with, and the checks hold what is served to it.
 *
 *   npm run headers:live    the deployed page's own response, held to the rules (after a deploy; needs the network)
 *
 * The policy allows only what the page is seen to load: its own scripts, styles, images, previews, manifest and service
 * worker; the stylesheet's three SVG masks as `data:` images; and the one inline stylesheet by its hash, worked out from
 * the built page each build, so a change to the styles needs no change here. Nothing runs inline, nothing is evaluated,
 * nothing comes from another origin, and nobody may frame the page.
 */
import { createHash } from 'node:crypto';

/** Every inline `<style>`'s CSP hash, in order, from the page as built. */
export function styleHashes(html: string): string[] {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
  );
}

/** The Content Security Policy for the page, given its inline styles' hashes. */
export function policy(styles: readonly string[]): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self' ${styles.join(' ')}`.trim(),
    "img-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The headers every response of the game is sent with, given the page as built. HSTS is Netlify's own on HTTPS, and is
 * not said here twice; the live check asks for it.
 */
export function headersFor(html: string): Record<string, string> {
  return {
    'Content-Security-Policy': policy(styleHashes(html)),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

/** Netlify's `_headers`: the headers for every path. */
export function headersFile(headers: Readonly<Record<string, string>>): string {
  return ['/*', ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`), ''].join('\n');
}

/** A `_headers` file's headers for every path, `/*`, read back. */
export function readHeadersFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let all = false;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      all = line.trim() === '/*';
      continue;
    }
    const at = line.indexOf(':');
    if (all && at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

/**
 * What is wrong with the headers a response was sent with, by name: the five the kit asks for, and a policy whose
 * `script-src` allows inline scripts or evaluation, or that says nothing of who may frame the page. `https` asks for
 * Strict-Transport-Security, which only a response over HTTPS can carry. Names are read in any case, as HTTP has them.
 */
export function headerProblems(sent: Readonly<Record<string, string>>, https: boolean): string[] {
  const h: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(sent).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const problems: string[] = [];
  const csp = h['content-security-policy'];
  if (!csp) problems.push('no Content-Security-Policy');
  else {
    const directives = new Map(
      csp
        .split(';')
        .map((d) => d.trim().split(/\s+/))
        .filter((d) => d[0])
        .map((d) => [d[0].toLowerCase(), d.slice(1)] as const),
    );
    const scripts = directives.get('script-src') ?? directives.get('default-src');
    if (!scripts) problems.push('the policy says nothing of scripts');
    else
      for (const bad of ["'unsafe-inline'", "'unsafe-eval'"])
        if (scripts.includes(bad)) problems.push(`the policy's script-src allows ${bad}`);
    if (!directives.has('frame-ancestors')) problems.push('the policy says nothing of frame-ancestors');
  }
  if (!h['x-frame-options']) problems.push('no X-Frame-Options');
  if (h['x-content-type-options']?.toLowerCase() !== 'nosniff') problems.push('no X-Content-Type-Options: nosniff');
  if (!h['referrer-policy']) problems.push('no Referrer-Policy');
  if (https && !h['strict-transport-security']) problems.push('no Strict-Transport-Security');
  return problems;
}
