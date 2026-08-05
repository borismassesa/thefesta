import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// styled-jsx only attaches its scoping class to plain DOM elements.
//
// Hand a scoped class straight to a React component — <Link className="ghost">,
// <Loader2 className="spin"> — and the element renders carrying the class name
// and none of the rules. Nothing errors. TypeScript is happy, ESLint is happy,
// the build is happy, and the styling is simply absent: a link renders as bare
// text, a spinner never turns.
//
// This bit three separate times while the top-up drawer was being built, each
// time invisible until someone looked at the running page. These tests read the
// source and fail on the shape, so the fourth time is caught here instead.

const drawerSrc = readFileSync(new URL('./TopUpDrawer.tsx', import.meta.url), 'utf8')

/** Class names declared inside a `<style jsx>` block, which are therefore
 *  scoped and unusable directly on a component. */
function scopedClassNames(src: string): Set<string> {
  const blocks = [...src.matchAll(/<style jsx>\{`([\s\S]*?)`\}<\/style>/g)].map((m) => m[1])
  const names = new Set<string>()
  for (const block of blocks) {
    // Skip anything reached through :global(...), which is the documented
    // escape hatch and works on components.
    const withoutGlobals = block.replace(/:global\([^)]*\)/g, '')
    for (const match of withoutGlobals.matchAll(/\.([a-zA-Z][\w-]*)/g)) names.add(match[1])
  }
  return names
}

/** JSX of the form `<Capitalised … className="…">`. */
function componentClassNameUsages(src: string): { component: string; classes: string[] }[] {
  const out: { component: string; classes: string[] }[] = []
  for (const match of src.matchAll(/<([A-Z][A-Za-z0-9]*)\b[^>]*?className="([^"{]*)"/g)) {
    out.push({ component: match[1], classes: match[2].split(/\s+/).filter(Boolean) })
  }
  return out
}

describe('styled-jsx scoped classes are never handed to a component', () => {
  it('every scoped class used on a component is reached via :global()', () => {
    const scoped = scopedClassNames(drawerSrc)
    assert.ok(scoped.size > 0, 'no scoped class names found — did the style block move?')

    // The escape hatches actually present in the file, each paired with a
    // `:global(...)` rule that makes it work on a component.
    const reachedGlobally = new Set(
      [...drawerSrc.matchAll(/:global\(\s*[a-z]*\.?([\w-]+)/g)].map((m) => m[1]),
    )

    const offenders = componentClassNameUsages(drawerSrc).flatMap(({ component, classes }) =>
      classes
        .filter((c) => scoped.has(c) && !reachedGlobally.has(c))
        .map((c) => `<${component} className="${c}">`),
    )

    assert.deepEqual(
      offenders,
      [],
      'These hand a styled-jsx-scoped class to a component, so the class renders ' +
        'with no styles at all. Put the class on a wrapping plain element, or ' +
        'reach it with :global() from inside a scoped parent.',
    )
  })

  it('the spinner keeps its class on a plain element', () => {
    // The specific regression: <Loader2 className="spin"> looked correct and
    // never animated.
    assert.ok(
      !/<Loader2[^>]*className="spin"/.test(drawerSrc),
      'the spin class is back on <Loader2>, where styled-jsx cannot reach it',
    )
    assert.ok(
      /<span className="spin">/.test(drawerSrc),
      'the spinner wrapper span is gone — the animation will not apply',
    )
  })
})
