import { Redirect } from 'expo-router';

/**
 * Landing route for `opuspass://sso-callback`, the default redirect Clerk's
 * `useSSO` builds. The in-app browser almost always intercepts the redirect
 * before the router sees it, but if the OS hands the URL to the app instead
 * this stops the router rendering a 404 mid-sign-in. `app/index.tsx` then
 * routes on the session that the SSO flow just created.
 */
export default function SsoCallbackScreen() {
  return <Redirect href="/" />;
}
