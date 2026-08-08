/**
 * Secure token cache for Clerk.
 *
 * Re-exported from Clerk rather than hand-rolled: their implementation stores
 * the item with `keychainAccessible: AFTER_FIRST_UNLOCK`, so a token read
 * succeeds while the screen is locked (the expo-secure-store default,
 * WHEN_UNLOCKED, fails there and logs the user out on a background refresh).
 * It also deletes and re-creates the item when the keychain entry is corrupt,
 * instead of leaving the app permanently unable to read its own session.
 *
 * Typed `TokenCache | undefined` because there is no secure store on web;
 * ClerkProvider's `tokenCache` prop is optional, so passing undefined is fine.
 */
export { tokenCache } from '@clerk/clerk-expo/token-cache';
