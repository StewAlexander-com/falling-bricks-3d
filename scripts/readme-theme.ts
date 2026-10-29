/**
 * Generates the README artwork in docs/images.
 *
 * The palette, type scale and card motif are taken from StewAlexander.com:
 * Georgia headings with tight tracking, Arial body copy, gold uppercase
 * eyebrow labels, mint links and panels topped with a 2px gold rule.
 *
 * Run with `npm run theme` after changing anything here.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'images');

interface Theme {
  bg: string;
  panel: string;
  ink: string;
  muted: string;
  gold: string;
  mint: string;
  line: string;
}

/** The site's own custom properties, read off stewalexander.com. */
const dark: Theme = {
  bg: '#101b25',
  panel: '#192b36',
  ink: '#f7f3e9',
  muted: '#bfccd3',
  gold: '#d9bd8e',
  mint: '#b9dcd6',
  line: '#354953',
};

/**
 * The site is dark only. For GitHub's light theme the ink colour becomes the
 * paper, and gold and mint are darkened until they pass contrast on it.
 */
const light: Theme = {
  bg: '#f7f3e9',
  panel: '#fffdf6',
  ink: '#101b25',
  muted: '#4d606b',
  gold: '#8a6a31',
  mint: '#1d5f57',
  line: '#ded4c0',
};

const THEMES: Array<[name: string, theme: Theme]> = [
  ['light', light],
  ['dark', dark],
];

const FONT_SERIF = "Georgia, 'Times New Roman', serif";
const FONT_SANS = 'Arial, Helvetica, sans-serif';

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Arial Bold advance widths, in 1/1000 em, for the characters eyebrows use. */
const ADVANCE: Record<string, number> = {
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  ' ': 278, '·': 333, '.': 278, ',': 278, '-': 333, '+': 584, '&': 722,
  '/': 278, '↗': 800,
};

function textWidth(text: string, fontSize: number, tracking: number): number {
  let em = 0;
  for (const char of text) em += ADVANCE[char] ?? (/[0-9]/.test(char) ? 556 : 667);
  return (em * fontSize) / 1000 + tracking * text.length;
}

function svg(width: number, height: number, body: string, title?: string): string {
  const label = title
    ? ` role="img" aria-label="${escape(title)}"`
    : ' role="presentation"';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}"${label}>${body}</svg>\n`
  );
}

function write(name: string, contents: string): void {
  writeFileSync(join(OUT_DIR, name), contents);
}

/**
 * The site's `.eyebrow`: 11px Arial bold, uppercase, 1.7px tracking, gold.
 * Rendered at its natural size so it stays 11px on a phone as well as a
 * desktop, rather than shrinking with the column like a full-width banner.
 */
function eyebrow(label: string, theme: Theme): string {
  const size = 11;
  const tracking = 1.7;
  const width = Math.ceil(textWidth(label, size, tracking)) + 4;
  const body =
    `<text x="0" y="12" fill="${theme.gold}" font-family="${FONT_SANS}" ` +
    `font-size="${size}" font-weight="bold" letter-spacing="${tracking}">${escape(label)}</text>`;
  return svg(width, 16, body, label);
}

/** The decorative linework on the masthead: bricks falling, one bursting, the ball. */
function bricks(theme: Theme, scale: number, dx: number, dy: number): string {
  const t = `translate(${dx} ${dy}) scale(${scale})`;
  return (
    `<g transform="${t}" fill="none" stroke="${theme.line}" stroke-width="${(1.4 / scale).toFixed(2)}">` +
    '<rect x="0" y="18" width="78" height="26" rx="6"/>' +
    '<rect x="150" y="0" width="78" height="26" rx="6"/>' +
    '<rect x="96" y="96" width="38" height="26" rx="6"/>' +
    '<rect x="166" y="86" width="38" height="26" rx="6"/>' +
    '<path d="M24-16V16M54-4V16M190-32V-2"/>' +
    '<path d="M122 78L110 92M178 68L190 82"/>' +
    '<path d="M-12 168H250"/>' +
    '</g>' +
    // The burst: a crack and its sparks, in gold.
    `<g transform="${t}" fill="none" stroke="${theme.gold}" stroke-width="${(1.4 / scale).toFixed(2)}">` +
    '<path d="M150 62V72M138 74L144 78M162 74L156 78"/>' +
    '</g>' +
    // The ball, and the row it is travelling along.
    `<g transform="${t}">` +
    `<circle cx="36" cy="160" r="9" fill="${theme.mint}"/>` +
    `<path d="M50 160H232" stroke="${theme.gold}" stroke-width="${(1.2 / scale).toFixed(2)}" fill="none"/>` +
    '</g>'
  );
}

function mastheadDesktop(theme: Theme): string {
  const w = 1000;
  const h = 232;
  const body =
    `<rect width="${w}" height="${h}" fill="${theme.bg}"/>` +
    // The site tops every card with a 2px gold rule.
    `<path d="M0 1H${w}" stroke="${theme.gold}" stroke-width="2"/>` +
    `<text x="48" y="44" fill="${theme.muted}" font-family="${FONT_SANS}" font-size="13" ` +
    `font-weight="bold" letter-spacing="2">STEW ALEXANDER</text>` +
    `<text x="48" y="66" fill="${theme.gold}" font-family="${FONT_SANS}" font-size="11" ` +
    `font-weight="bold" letter-spacing="1.7">WEB GAME · OPEN SOURCE · NOTHING TO INSTALL</text>` +
    `<text x="48" y="136" fill="${theme.ink}" font-family="${FONT_SERIF}" font-size="58" ` +
    `letter-spacing="-1.8">Falling Bricks 3D</text>` +
    `<text x="48" y="172" fill="${theme.muted}" font-family="${FONT_SANS}" font-size="17">` +
    `Dodge the bricks. Beat your best. Open it in any browser.</text>` +
    `<path d="M48 198H112" stroke="${theme.mint}" stroke-width="3"/>` +
    bricks(theme, 0.95, 690, 44);
  return svg(
    w,
    h,
    body,
    'Falling Bricks 3D. Stew Alexander. A web game, open source, nothing to install.',
  );
}

function mastheadMobile(theme: Theme): string {
  const w = 600;
  const h = 300;
  const body =
    `<rect width="${w}" height="${h}" fill="${theme.bg}"/>` +
    `<path d="M0 1.5H${w}" stroke="${theme.gold}" stroke-width="3"/>` +
    `<text x="38" y="52" fill="${theme.muted}" font-family="${FONT_SANS}" font-size="17" ` +
    `font-weight="bold" letter-spacing="2.4">STEW ALEXANDER</text>` +
    `<text x="38" y="80" fill="${theme.gold}" font-family="${FONT_SANS}" font-size="15" ` +
    `font-weight="bold" letter-spacing="2">WEB GAME · OPEN SOURCE</text>` +
    `<g fill="${theme.ink}" font-family="${FONT_SERIF}" font-size="58" letter-spacing="-1.6">` +
    '<text x="38" y="158">Falling</text><text x="38" y="216">Bricks 3D</text></g>' +
    `<text x="38" y="250" fill="${theme.muted}" font-family="${FONT_SANS}" font-size="19">` +
    'Dodge the bricks. Beat your best.</text>' +
    `<path d="M38 274H102" stroke="${theme.mint}" stroke-width="4"/>` +
    bricks(theme, 0.62, 418, 108);
  return svg(
    w,
    h,
    body,
    'Falling Bricks 3D. Stew Alexander. A web game, open source, nothing to install.',
  );
}

/** The site's `.cta`: a mint button with dark text. One file, it reads on both themes. */
function cta(label: string): string {
  const size = 14;
  const tracking = 1.2;
  const width = Math.ceil(textWidth(label, size, tracking)) + 44;
  const h = 44;
  const body =
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${h - 1}" rx="4" ` +
    `fill="${dark.mint}" stroke="#cbe8e2"/>` +
    `<text x="22" y="28" fill="#112c30" font-family="${FONT_SANS}" font-size="${size}" ` +
    `font-weight="bold" letter-spacing="${tracking}">${escape(label)}</text>`;
  return svg(width, h, body, label);
}

/** Closing strip, echoing the site footer. */
function footer(theme: Theme, wide: boolean): string {
  const w = wide ? 1000 : 600;
  const h = wide ? 104 : 132;
  const serif = wide ? 26 : 30;
  const sans = wide ? 14 : 17;
  const pad = wide ? 48 : 38;
  const body =
    `<rect width="${w}" height="${h}" fill="${theme.panel}"/>` +
    `<path d="M0 1H${w}" stroke="${theme.gold}" stroke-width="2"/>` +
    `<text x="${pad}" y="${wide ? 50 : 58}" fill="${theme.ink}" font-family="${FONT_SERIF}" ` +
    `font-size="${serif}" letter-spacing="-0.6">Independent thinking. Practical work.</text>` +
    `<text x="${pad}" y="${wide ? 76 : 92}" fill="${theme.muted}" font-family="${FONT_SANS}" ` +
    `font-size="${sans}">More projects and research at stewalexander.com</text>` +
    (wide
      ? `<text x="${w - pad}" y="60" fill="${theme.mint}" text-anchor="end" ` +
        `font-family="${FONT_SANS}" font-size="15" font-weight="bold">StewAlexander.com ↗</text>`
      : `<text x="${pad}" y="118" fill="${theme.mint}" font-family="${FONT_SANS}" ` +
        `font-size="17" font-weight="bold">StewAlexander.com ↗</text>`);
  return svg(w, h, body, 'Independent thinking. Practical work. More at StewAlexander.com');
}

const EYEBROWS: Array<[slug: string, label: string]> = [
  ['how-to-play', 'TWO MINUTES TO LEARN'],
  ['levels-1-3', 'LEVELS 1 TO 3 · THE BASICS'],
  ['level-4-up', 'LEVEL 4 AND UP · CRACKED BRICKS'],
  ['fair', 'DESIGN PROMISE'],
  ['phone', 'ON A PHONE'],
  ['settings', 'SAVED ON YOUR DEVICE'],
  ['original', 'FAITHFUL TO THE ORIGINAL'],
  ['new', 'NEW IN THE REMAKE'],
  ['performance', 'MEASURED ON DEVICE'],
  ['browsers', 'COMPATIBILITY'],
  ['development', 'NODE · VITE · THREE.JS'],
  ['credits', 'WITH THANKS'],
  ['license', 'GPL-3.0'],
];

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, theme] of THEMES) {
  write(`masthead-${name}-desktop.svg`, mastheadDesktop(theme));
  write(`masthead-${name}-mobile.svg`, mastheadMobile(theme));
  write(`footer-${name}-desktop.svg`, footer(theme, true));
  write(`footer-${name}-mobile.svg`, footer(theme, false));
  for (const [slug, label] of EYEBROWS) {
    write(`eyebrow-${slug}-${name}.svg`, eyebrow(label, theme));
  }
}

write('cta-play.svg', cta('PLAY NOW ↗'));

console.log(`Wrote ${THEMES.length * (4 + EYEBROWS.length) + 1} files to docs/images`);
