/**
 * The app as a browser installs it: the manifest names it, its icons are on disk at the sizes it says and under a
 * ceiling, and its colours are the stylesheet's boot sky, so the window's chrome and the splash are the sky the page
 * boots on. Without this an icon could go missing from `public/` or the manifest name a size that is not there, and no
 * browser would say so until a player tried to install.
 */
import { readFileSync, statSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};
const page = readFileSync('index.html', 'utf8');
/** The boot sky, as the stylesheet names it. */
const boot = /--boot:\s*(#[0-9a-f]{6})/i.exec(page)![1];

/** Each icon file may cost at most this, and all of them together `ICONS_KB`: they are fetched when a browser weighs installing, not at boot. */
const ICON_KB = 160;
const ICONS_KB = 320;

describe('the manifest', () => {
  it('names the app, opens standalone from the root, and is coloured the boot sky', () => {
    expect(manifest.name).toBe('Ooergolf');
    expect(manifest.short_name).toBe('Of Course!');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe(boot);
    expect(manifest.theme_color).toBe(boot);
  });

  it('has icons of 192 and 512 for any purpose and one of 512 to mask, each on disk at its size', () => {
    const sizes = manifest.icons.map((i) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`);
    expect(sizes).toEqual(['192x192', '512x512', '512x512 maskable']);
    for (const icon of manifest.icons) {
      const png = PNG.sync.read(readFileSync(`public/${icon.src}`));
      expect(icon.type).toBe('image/png');
      expect(`${png.width}x${png.height}`, icon.src).toBe(icon.sizes);
    }
  });

  it('keeps every icon, the apple touch icon too, under its ceiling', () => {
    const files = [...manifest.icons.map((i) => `public/${i.src}`), 'public/icons/apple-touch-icon.png'];
    let all = 0;
    for (const f of files) {
      const kb = statSync(f).size / 1024;
      expect(kb, f).toBeLessThanOrEqual(ICON_KB);
      all += kb;
    }
    expect(all).toBeLessThanOrEqual(ICONS_KB);
    const apple = PNG.sync.read(readFileSync('public/icons/apple-touch-icon.png'));
    expect([apple.width, apple.height]).toEqual([180, 180]);
  });
});

describe('the page', () => {
  it('links the manifest and the apple touch icon, and colours its chrome the boot sky', () => {
    expect(page).toContain('<link rel="manifest" href="manifest.webmanifest" />');
    expect(page).toContain(`<meta name="theme-color" content="${boot}" />`);
    expect(page).toContain('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />');
    expect(page).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(page).toContain('<meta name="apple-mobile-web-app-title" content="Of Course!" />');
  });
});
