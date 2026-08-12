# ADR: Opus Design Engine / Design Studio

Status: Accepted  
Date: 2026-08-11

## Context

OpusPass personalises and delivers invitation cards at scale (immutable releases → per-guest PNG → WhatsApp), but artwork is authored outside the product (Illustrator → SVG upload → Layer Mapper). We need a Canva-like, card-specific design studio so designers can author invitation artwork in-app while keeping deterministic production rendering.

## Decision

1. **Design Document is the source of truth** for Studio-origin artwork — not SVG, not the browser canvas library serialisation.
2. **Three objects stay separate:** Master Design → Event Design → Guest Render (`release_id` + `guest_id` + params).
3. **Editor ≠ renderer.** The browser Studio is a viewport. Production compiles Document → Render Plan → SVG/PNG on the server.
4. **Parallel bridge:** Legacy Illustrator → Layer Mapper → release path keeps shipping until Studio releases pass the same preflight/raster contracts.
5. **Host:** OpusPass Design Studio lives in `opus_admin` at `/opus-pass/design-studio`, gated by `digitalcards.*`.
6. **Package:** Shared schema/compile/validate/render-plan live in `@opusfesta/design-engine`. Reuse fit/font/role ideas from `@opusfesta/lib` without making SVG-derived `CardLayout` the new SoT.

## Consequences

- New `design_*` tables store versioned JSON documents, assets, swatches, releases, render jobs, and guest overrides.
- Canvas libraries (if any) never become the persistence format.
- Guest delivery eventually accepts Studio template releases alongside legacy SVG releases; cutover is explicit and gated.

## SVG / EPS import (goal)

**Goal:** Import designer SVG without destroying layer structure — paths, groups, and text become Studio layers.

| Format | Support |
|--------|---------|
| **SVG** | **Layered** (default): top-level drawables → `svg_graphic` with inline `markup`; nested `<g>` expanded into child layers (depth 2); top-level `<text>` → editable text. No flattened plate (avoids duplicate ink). Legacy `plate_plus_text` still available. |
| **EPS** | Not supported. Convert to SVG (Illustrator / Inkscape) first, then import. |

Honest limits: text nested deeper than expanded groups may stay baked in markup; filters/masks/animations are flagged unsupported; true Illustrator layer names need `id` / `inkscape:label` / `data-name`. Path bounds are best-effort from `d` samples.