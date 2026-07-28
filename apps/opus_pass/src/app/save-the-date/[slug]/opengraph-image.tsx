export { default, alt, contentType, size } from '../../rsvp/event/[slug]/opengraph-image'

// `runtime` has to be statically parseable in the route's own file, so it can't
// come through the re-export above (Turbopack fails the build on it). Keep in
// sync with the source module, which needs Node for the service-role
// getPublicInvite query.
export const runtime = 'nodejs'
