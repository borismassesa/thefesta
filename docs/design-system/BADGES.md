# Opus badge system

Badges communicate a compact state, category, or piece of metadata. They are not buttons and must not be styled as interactive controls unless the entire element is implemented as a link or button with the appropriate semantics.

## Geometry

The approved reference is the default `medium` badge:

- Height: 30px minimum
- Horizontal padding: 8px
- Vertical padding: 4px
- Icon: 16px
- Icon-to-label gap: 8px
- Radius: 10px
- Type: 14px / 22px, semibold, `0.0125em` letter spacing

The `small` 24px badge is reserved for dense data tables and narrow list rows. Do not create page-specific intermediate sizes.

## Semantic tones

| Tone      | Use                                           | Background              | Foreground |
| --------- | --------------------------------------------- | ----------------------- | ---------- |
| `error`   | Error, rejected, declined, cancelled, expired | Opus rose `#FCE4EC`     | `#9B1D4C`  |
| `info`    | Information, draft, revision, brand status    | Opus lavender `#F0DFF6` | `#5B2D8E`  |
| `success` | Approved, active, live, completed, accepted   | Soft green `#E6F1E6`    | `#166534`  |
| `warning` | Pending, scheduled, in review, attention      | Soft amber `#FEF3DB`    | `#8A5A09`  |
| `neutral` | Inactive or uncategorized metadata            | Gray `#F3F4F6`          | `#4B5563`  |

Lavender is the Opus brand information color. It does not replace semantic error, warning, or success colors.

## Usage

```tsx
import { opusBadgeClass } from '@opusfesta/lib';
import { Info } from 'lucide-react';

<span className={opusBadgeClass({ tone: 'info' })}>
  <Info aria-hidden="true" />
  <span className="opus-badge__label">Draft</span>
</span>;
```

For arbitrary workflow strings, use `opusStatusBadgeTone(status)` to select the semantic tone. Product-specific components may map their known domain statuses explicitly when that mapping is clearer.

## Accessibility

- A badge label must remain understandable without color or icon.
- Decorative icons use `aria-hidden="true"`.
- Do not rely on an indicator dot alone.
- Keep labels short and use the provided truncating label wrapper in constrained layouts.
- Interactive filters that look like badges must use a real `<button>` and the shared button interaction/focus rules.

## Product coverage

The stylesheet is imported globally by Opus Admin, OpusPass, Opus Website, and Vendors Portal. Shared status primitives in those products should use `opusBadgeClass` or the `.opus-badge` classes rather than recreating padding, radius, typography, or semantic colors locally.
