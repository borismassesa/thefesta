import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  opusBadgeClass,
  opusStatusBadgeTone,
  type OpusBadgeSize,
  type OpusBadgeTone,
} from './badge-design';

const badgeCss = readFileSync(
  new URL('./styles/badges.css', import.meta.url),
  'utf8'
);
const workspaceRoot = new URL('../../', import.meta.url);

test('uses the medium neutral badge by default', () => {
  assert.equal(
    opusBadgeClass(),
    'opus-badge opus-badge--neutral opus-badge--medium'
  );
});

test('returns every supported tone and size as stable design-system classes', () => {
  const tones: OpusBadgeTone[] = [
    'error',
    'info',
    'success',
    'warning',
    'neutral',
  ];
  const sizes: OpusBadgeSize[] = ['medium', 'small'];

  for (const tone of tones) {
    for (const size of sizes) {
      assert.equal(
        opusBadgeClass({ tone, size }),
        `opus-badge opus-badge--${tone} opus-badge--${size}`
      );
    }
  }
});

test('matches the approved medium badge geometry', () => {
  assert.match(badgeCss, /min-height:\s*1\.875rem/);
  assert.match(badgeCss, /padding:\s*0\.25rem 0\.5rem/);
  assert.match(badgeCss, /gap:\s*0\.5rem/);
  assert.match(badgeCss, /border-radius:\s*var\(--opus-radius-small, 0\.5rem\)/);
  assert.match(badgeCss, /font-size:\s*0\.875rem/);
  assert.match(badgeCss, /font-weight:\s*600/);
});

test('maps common product statuses to stable semantic tones', () => {
  assert.equal(opusStatusBadgeTone('rejected'), 'error');
  assert.equal(opusStatusBadgeTone('published'), 'success');
  assert.equal(opusStatusBadgeTone('pending approval'), 'warning');
  assert.equal(opusStatusBadgeTone('draft'), 'info');
  assert.equal(opusStatusBadgeTone('custom state'), 'neutral');
});

test('all four web products import the shared badge stylesheet', () => {
  const globalStyles = [
    'apps/opus_admin/src/app/globals.css',
    'apps/opus_website/src/app/globals.css',
    'apps/opus_pass/src/app/globals.css',
    'apps/vendors_portal/src/app/globals.css',
  ];

  for (const file of globalStyles) {
    const css = readFileSync(new URL(file, workspaceRoot), 'utf8');
    assert.match(css, /@opusfesta\/lib\/styles\/badges\.css/, file);
  }
});
