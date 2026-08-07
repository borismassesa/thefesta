import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISPLAY_SCALE,
  FONT_FAMILY,
  MAX_FONT_SCALE,
  SPACING,
  TYPE_SCALE,
  type TypeStep,
} from './designTokens';

/**
 * The design system has two consumers — React Native style objects and
 * Tailwind utilities — and one source. These pin the properties that make that
 * arrangement safe, because the failure mode is silent: a scale that drifts
 * does not crash, it just makes two screens disagree about what a card title
 * is, and nobody notices until a designer opens the app.
 */

test('every operational step declares a unique Tailwind utility', () => {
  const utilities = Object.values(TYPE_SCALE).map((s) => s.utility);
  for (const step of Object.values(TYPE_SCALE)) {
    assert.ok((step.utility ?? '').length > 0, 'a step with no utility cannot be used in a className');
  }
  // Display steps deliberately have none: they are RN-style only, and naming
  // a utility they do not generate is how the two scales came to claim the
  // same class name.
  for (const step of Object.values(DISPLAY_SCALE) as TypeStep[]) {
    assert.equal(step.utility, undefined, 'celebratory type is not exposed as a class');
  }
  assert.equal(
    new Set(utilities).size,
    utilities.length,
    'two steps sharing a utility means one silently wins'
  );
});

test('only Inter and the one display face are referenced', () => {
  // The point of the migration: Work Sans, Space Grotesk and Dancing Script
  // are gone, and nothing may quietly reintroduce a family that is not loaded
  // in app/_layout.tsx.
  const allowed = new Set(Object.values(FONT_FAMILY));
  for (const step of [...Object.values(TYPE_SCALE), ...Object.values(DISPLAY_SCALE)]) {
    assert.ok(allowed.has(step.family as never), `${step.family} is not a loaded font`);
  }
});

test('the operational scale is Inter only; Playfair is display-only', () => {
  // Playfair on an operational step is the regression this system exists to
  // prevent: it is how the app accumulated 47 serif screen titles nobody had
  // chosen. Celebratory type stays in its own scale.
  for (const [name, step] of Object.entries(TYPE_SCALE)) {
    assert.notEqual(step.family, FONT_FAMILY.display, `${name} must not use the display face`);
  }
  for (const step of Object.values(DISPLAY_SCALE)) {
    assert.equal(step.family, FONT_FAMILY.display);
  }
});

test('no step uses a weight lighter than Regular', () => {
  // Thin, ExtraLight and Light are excluded by the design system: they fail
  // on low-contrast surfaces and disappear entirely in daylight at a door.
  const banned = /thin|extralight|light/i;
  for (const step of [...Object.values(TYPE_SCALE), ...Object.values(DISPLAY_SCALE)]) {
    assert.ok(!banned.test(step.family), `${step.family} is a banned weight`);
  }
});

test('line heights are sane multiples of their size', () => {
  // Between 115% and 155%: below that text collides, above it stops reading as
  // one block. Body is deliberately the loosest, being the only step read in
  // paragraphs.
  for (const [name, step] of Object.entries(TYPE_SCALE)) {
    const ratio = step.lineHeight / step.size;
    assert.ok(ratio >= 1.15 && ratio <= 1.55, `${name} line height ratio ${ratio.toFixed(2)} is off-scale`);
  }
  assert.ok(TYPE_SCALE.body.lineHeight / TYPE_SCALE.body.size >= 1.45);
});

test('spacing is an 8-point system, with one deliberate 4', () => {
  for (const [name, value] of Object.entries(SPACING)) {
    assert.ok(value % 8 === 0 || value === 4 || value === 12 || value === 20, `${name}=${value} breaks the rhythm`);
  }
  assert.equal(SPACING.xxs, 4, 'the label-to-thing gap');
});

test('font scaling is capped but never below the system size', () => {
  // A cap under 1 would shrink text when the reader asked for bigger, which
  // is the accessibility bug this guard exists to make impossible.
  for (const [name, cap] of Object.entries(MAX_FONT_SCALE)) {
    assert.ok(cap > 1, `${name} cap of ${cap} would shrink text`);
    assert.ok(cap <= 2, `${name} cap of ${cap} lets type push controls off screen`);
  }
  // Larger type has less room to grow: it starts with more already spent.
  assert.ok(MAX_FONT_SCALE.display < MAX_FONT_SCALE.body);
});

test('the Tailwind config really does generate these utilities', async () => {
  // The claim in designTokens.ts is that both consumers read one source. This
  // is what makes it true rather than aspirational: it imports the actual
  // config and compares what Tailwind will emit against the tokens. A future
  // hand-edit inside tailwind.config.ts now fails here instead of shipping.
  const config = (await import('../../tailwind.config')).default as {
    theme?: { extend?: Record<string, unknown> };
  };
  const extend = config.theme?.extend ?? {};
  const fontSize = extend.fontSize as Record<string, [string, { lineHeight: string; letterSpacing: string }]>;

  for (const step of Object.values(TYPE_SCALE)) {
    const emitted = fontSize[step.utility as string];
    assert.ok(emitted, `${step.utility} is missing from the Tailwind fontSize scale`);
    assert.equal(emitted[0], `${step.size}px`);
    assert.equal(emitted[1].lineHeight, `${step.lineHeight}px`);
    assert.equal(emitted[1].letterSpacing, `${step.letterSpacing}px`);
  }

  // Celebratory type is reached through RN styles, never a class, so it must
  // NOT appear here — and must never quietly take over an Inter utility.
  const emittedFamilies = Object.values(extend.fontFamily as Record<string, string[]>).flat();
  assert.ok(
    emittedFamilies.filter((f) => f === FONT_FAMILY.display).length === 1,
    'the display face belongs to exactly one utility'
  );

  // Radii must not collide with Tailwind's own rounded-sm/md/lg/xl, which are
  // 2/6/8/12px. Overriding those silently resized 36 existing call sites once
  // already; the prefix is what stops it happening again.
  const radii = extend.borderRadius as Record<string, string>;
  for (const reserved of ['sm', 'md', 'lg', 'xl']) {
    assert.ok(
      !(reserved in radii),
      `rounded-${reserved} is Tailwind's own; overriding it changes every existing usage`
    );
  }
});
