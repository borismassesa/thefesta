/**
 * Creates the one test class and object behind the WhatsApp redirect proof.
 *
 * Run from apps/opus_pass:
 *   npx tsx --env-file=.env.local scripts/provision-wallet-proof-pass.ts
 *
 * Idempotent. The class is upserted and the object's id is derived from the
 * fixed proof model, so a repeat run refreshes what is already there rather
 * than creating a second anything. Safe to run as many times as needed.
 *
 * WHAT THIS WRITES TO GOOGLE. One event ticket class and one object under the
 * live OpusPass issuer, both named for what they are, both carrying a credential
 * that reads "proof-only-not-a-real-admission-credential" and admits nobody.
 * Google object ids are permanent, so this consumes one id forever. That is the
 * intended cost: the proof needs a real object at Google, because a save link
 * that references a missing object fails in a way that would look exactly like
 * the WhatsApp failure being tested for.
 *
 * It does NOT touch the database, any guest, or GOOGLE_WALLET_PAUSED.
 */
import { loadGoogleWalletConfig } from '../src/lib/wallet/google-core'
import { provisionGooglePass, type FetchLike } from '../src/lib/wallet/google-rest'
import { proofPassModel } from '../src/lib/wallet/redirect-proof'

// Wrapped rather than top level: tsx transforms this file to CJS, where a
// top-level await is a syntax error.
async function main(): Promise<void> {
  const config = loadGoogleWalletConfig(process.env)
  if (!config) {
    // loadGoogleWalletConfig has already logged WHICH part is wrong, so this
    // only adds what it cannot know: how the script is meant to be invoked.
    console.error(
      '\nGoogle Wallet is not configured here. The line above names the cause.\n\n' +
        'Provisioning from a local machine needs the asset origin overridden, because\n' +
        'Google fetches the class logo and cannot reach localhost:\n\n' +
        '  GOOGLE_WALLET_ASSET_BASE_URL=https://opuspass.opusfesta.com \\\n' +
        '    npx tsx --env-file=.env.local scripts/provision-wallet-proof-pass.ts\n'
    )
    process.exit(1)
  }

  const model = proofPassModel()

  console.log('issuer     :', config.issuerId)
  console.log('origin     :', config.origin)
  console.log('guest      :', model.guestName, '/', model.eventName)
  console.log('\nprovisioning...\n')

  const result = await provisionGooglePass(config, model, fetch as unknown as FetchLike)

  if (!result.ok) {
    // Short codes only, the same discipline as the adapter: Google echoes the
    // request in its error payloads and the request body carries the credential.
    console.error('FAILED:', result.code)
    console.error(
      '\nclass_http_403 / object_http_403 means the service account is not a Developer\n' +
        'on the issuer. See docs/OPUSPASS_WALLET_PROVIDER_SETUP.md section 1.7.\n'
    )
    process.exit(1)
  }

  console.log('OK')
  console.log('class      :', result.classId)
  console.log('object     :', result.objectId)
  console.log(
    '\nNext: set WALLET_REDIRECT_PROOF_CODE to a random string on the opus_pass\n' +
      'Vercel project, deploy, then open https://opuspass.opusfesta.com/t/<that-code>\n' +
      'in a browser. It should land on Google Wallet showing "Test Guest".\n'
  )
}

void main()
