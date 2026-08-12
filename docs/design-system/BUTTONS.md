# Opus button system

All Opus products use the same button geometry and interaction states. The
shared source of truth is `packages/lib/styles/buttons.css`; application code
selects a variant and size with `opusButtonClass` from `@opusfesta/lib` or the
local `Button` primitive.

## Sizes

| Name | Height | Horizontal padding | Text |
| --- | ---: | ---: | --- |
| Large | 52 px | 24 px | 16 px / 24 px, semibold |
| Medium | 44 px | 16 px | 16 px / 24 px, semibold |
| Small | 30 px | 12 px | 14 px / 22 px, semibold |
| Icon medium | 44 × 44 px | 0 | 20 px icon |
| Icon small | 24 × 24 px | 0 | 16 px icon |

Buttons always use a full pill radius. Do not create page-specific heights,
padding, radii, font weights, disabled styles, or focus rings.

## Variants

- `primary`: lavender fill for the one leading action in a section.
- `secondary`: pale lavender fill for a supporting action.
- `neutral`: white with a gray border for cancel, back, export, and low-emphasis actions.
- `danger`: white with a rose border for destructive or rejecting actions.
- `warning`: pale amber for pause, defer, or request-changes actions.
- `tertiary`: underlined deep-lavender text for the quietest action.

Deep purple is used for readable text, icons, and the focus outline. It is not
used as a large filled action surface. Green is reserved for success status,
not ordinary actions.

## Usage

```tsx
import { Button } from '@/components/ui/Button'

<Button>Create requisition</Button>
<Button variant="secondary">Save draft</Button>
<Button variant="danger" size="small">Reject</Button>
```

For a Next.js `Link` or another button-like element:

```tsx
import { opusButtonClass } from '@opusfesta/lib'

<Link className={opusButtonClass({ variant: 'neutral', size: 'large' })} href="/careers">
  Back to careers
</Link>
```

Layout utilities such as `w-full`, `mt-4`, and grid-column placement may be
added by the caller. Visual button styling must remain in the shared system.
