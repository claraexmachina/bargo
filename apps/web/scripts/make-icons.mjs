/**
 * Generates placeholder PNG icons from the SVG.
 * Requires: sharp  (npm install -D sharp)
 * Usage: node scripts/make-icons.mjs
 *
 * For demo purposes, placeholder PNGs are committed.
 * Run this script only when regenerating from SVG changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');

// TODO: Replace with actual sharp-based generation when sharp is installed.
// Placeholder: write a minimal 1x1 PNG that satisfies browser PWA install requirements.
// The SVG icon is committed at public/icon.svg for visual reference.

const PLACEHOLDER_PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

writeFileSync(join(publicDir, 'icon-192.png'), PLACEHOLDER_PNG_1x1);
writeFileSync(join(publicDir, 'icon-512.png'), PLACEHOLDER_PNG_1x1);

console.log('Placeholder icon PNGs written to public/');
console.log('TODO: install sharp and use SVG → PNG conversion for production icons.');
