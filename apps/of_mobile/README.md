# OpusFesta Mobile

> **⚠️ Deprecated.** This app is no longer actively developed. `apps/opus_pass_mobile`
> (OpusPass) is the active mobile app going forward — new mobile work should land there
> instead of here.

The couple-facing wedding planning app: browse and book vendors, manage a guest list, plan a
budget/checklist, build a wedding website, and message vendors — all backed by the same
Supabase project as `apps/opus_website`, `apps/opus_pass`, and `apps/opus_admin`.

Built with Expo SDK 54, expo-router 6, Clerk (auth), Supabase (data), and TanStack Query.

## Getting started

```bash
npm install
cp .env.example .env   # fill in Clerk + Supabase values
npm run start           # expo start
```

Requires `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` — see `.env.example`. Without these the app renders a
"missing environment configuration" screen instead of crashing.

## Scripts

| Script | What it does |
|---|---|
| `npm run start` | Expo dev server |
| `npm run ios` / `npm run android` | Native dev build |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test` | Runs `*.test.ts` files under `src/` via Node's built-in test runner (`tsx --test`) |
| `npm run lint` | ESLint (currently broken independent of app code — the config's glob resolves to fully-ignored; not yet fixed) |
| `npm run build` | Alias for `type-check` |

Release builds go through `scripts/testflight-local.sh` at the repo root — see that script for
the local TestFlight flow (EAS env pull, prebuild, archive, upload).

## Architecture notes

- **Auth**: Clerk issues a JWT (`supabase` template) that's injected into every authenticated
  Supabase request — see `useAuthenticatedSupabase()` in `src/lib/supabase.ts`. There's also a
  plain anon `supabase` client for public reads (vendor browsing/search) that don't need a user
  session.
- **Guest list reuses OpusPass's data layer** (`guest_contacts`, `guest_invitations`,
  `wedding_events`) rather than a mobile-only table — see the comment in
  `src/lib/api/guests.ts`. The public RSVP page guests fill out lives on OpusPass's own
  subdomain (`opuspass.opusfesta.com/rsvp/:token`); mobile has no guest-facing RSVP screen of
  its own and hands off to it via the native share sheet.
- **Deep linking** (`src/lib/deepLinks.ts` + `src/hooks/useInboundDeepLinks.ts`) resolves
  `opusfesta://...` and `https://opusfesta.com/...` URLs to expo-router routes, gated on
  signed-in + onboarded (links that arrive earlier are stashed and resumed after auth). Only the
  custom URL scheme is wired up — tapping an `https://opusfesta.com/...` link outside the app
  still opens the system browser; true universal links need native associated-domains/App Links
  config and an AASA/`assetlinks.json` file, which isn't set up yet (there's no Android native
  project checked into the repo either).
- **Push notifications** (`src/hooks/usePushNotifications.ts`) register an Expo push token per
  signed-in session against `push_device_tokens`, and route notification taps through the same
  kind of `router.push` target the deep-link resolver produces.
- **No bookings table** — booked vendors are `saved_vendors` rows with `status = 'booked'`, and
  booking requests are `inquiries` rows. This is deliberate, matching the web app; see the
  comments in `src/lib/api/bookings.ts` / `src/lib/api/events.ts` before "fixing" it.

## Project structure

```
app/                  expo-router routes (file-based)
  (auth)/              sign-in/up, OAuth, 2FA
  (onboarding)/        couple (10 steps) + vendor (4 steps) onboarding
  (tabs)/              Home / Vendors / Planning / Messages / Website
  planning/            budget, checklist, guest list, inspiration board
  vendor/[id].tsx       vendor detail
  booking/[vendorId].tsx
  website/             wedding website editor screens
src/
  lib/api/             Supabase query/mutation functions, grouped by domain
  hooks/                TanStack Query hooks wrapping lib/api
  components/           shared UI (layout/, ui/, vendors/, wedding-website/)
  constants/theme.ts    the "editorial" design token set used by newer screens
```

## Testing

Two runners, split by file extension — `npm test` runs both:

- **`*.test.ts` → Node** (`npm run test:node`): pure-logic tests via Node's built-in runner
  through `tsx`, matching the convention in `apps/opus_admin`. Keep these targets free of
  `react-native`/`@clerk/clerk-expo` imports (even transitively) — those only load under the
  Metro/RN toolchain and will fail to parse under plain Node. If a module you want to test
  pulls one in (e.g. anything importing `src/lib/supabase.ts`), split the pure logic into its
  own file the way `src/lib/deepLinkSegments.ts` was split out of `src/lib/deepLinks.ts`.
- **`*.test.tsx` → jest-expo** (`npm run test:jest`): anything needing the RN/Clerk/Supabase/
  TanStack-Query machinery — hooks, components, screens. Use the `.tsx` extension even when a
  test contains no JSX; the extension is what routes it to the right runner. Config lives in
  `jest.config.js` (note the React-version forcing in `moduleNameMapper`, mirroring
  `metro.config.js` — the monorepo hoists a different React for the web apps). `jest-expo` is
  pinned exactly (no `~`/`^`): newer 54.x patches add a `react-server-dom-webpack` peer this
  app doesn't want.

Conventions for jest tests: mock the `@/lib/api/*` layer (not the whole Supabase SDK), mock
`@/lib/supabase`'s `useAuthenticatedSupabase` with a stub, and render query/mutation hooks via
`src/test/renderHookWithQueryClient.tsx` (fresh QueryClient, retries off, gc timers off; returns
the client so you can spy on `invalidateQueries`). RTL v14's `render`/`renderHook` are async —
always `await` them. For AsyncStorage, use the official mock
(`@react-native-async-storage/async-storage/jest/async-storage-mock`); see
`src/hooks/useChecklist.test.tsx`.
