# OpusPass Wallet: Google and Apple provider setup

Prerequisites for PR 4 (wallet provider adapters). Everything here has to be
done by a person with the OpusFesta accounts. None of it can be automated, and
none of the secrets it produces should ever be pasted into a chat, a ticket or
the repo.

**Do Google first.** Its issuer approval is a manual review that takes days,
but demo mode works immediately, so development is not blocked while it sits in
the queue. Apple is instant once the Developer Program membership exists, but
the certificate expires yearly and that renewal is a real operational task.

---

## Part 1 — Google Wallet

Roughly 30 minutes of work, then 3 to 5 business days of waiting for issuer
approval. Start it before you need it.

### 1.1 Create the issuer account

1. Go to the [Google Pay & Wallet Console](https://pay.google.com/business/console).
   Sign in with the Google account that should hold the **Admin** role. Use a
   shared OpusFesta account, not a personal one: this role cannot be
   transferred easily, and losing it means losing pass publishing.
2. Provide the public business name. This string is shown to guests inside
   Google Wallet, so it should read as the brand a guest expects, not a legal
   entity name.
3. Accept the Google Wallet API Additional Terms of Service.
4. On the dashboard, find the **Google Wallet API** card and click **Create a
   pass**, then **Build your first pass**. Accept the Google Wallet API Terms.

That creates the Issuer account.

### 1.2 Record the Issuer ID

In the console's Google Wallet API section, copy the **Issuer ID** (a long
number). This becomes `GOOGLE_WALLET_ISSUER_ID`.

### 1.3 Understand demo mode

Every new account starts in **demo mode**. Passes can be created, but only
issued to Google accounts holding the Admin or Developer role, or explicitly
added as test accounts. This is exactly what we want for the pilot: add the
team's Google accounts as test accounts and the whole flow is testable end to
end before approval lands.

Request publishing access from the console when the integration works. Until it
is granted, a real guest cannot save a pass.

### 1.4 Enable the API in Google Cloud

The Wallet API must be enabled separately from the issuer account.

1. In the [Google Cloud Console](https://console.cloud.google.com), create a
   project (or reuse an existing OpusFesta one).
2. **APIs & Services → Library → Google Wallet API → Enable.**

### 1.5 Create the service account

1. **IAM & Admin → Service Accounts → Create service account.**
   Name it something legible, e.g. `opuspass-wallet-issuer`.
2. No project-level IAM role is required. Wallet permissions are granted in the
   Pay & Wallet Console, not through Cloud IAM.
3. Open the service account → **Keys → Add key → Create new key → JSON**.
   The JSON downloads once. Treat it as a live credential.

### 1.6 Authorise the service account on the issuer

**Mandatory, not optional.** Issuance calls the Google Wallet REST API to create
the event's class and the guest's object before it mints a save link, so the key
must hold rights on the issuer or nothing can be issued at all. (An earlier
adapter defined the pass inline inside the save JWT and made no API calls, which
is why this step used to be skippable. That path was withdrawn: a realistic pass
exceeded Google's save-link length guidance, and it carried the admission
credential in the URL.)

Back in the Google Pay & Wallet Console, go to **Users** and add the service
account's email address (`...@....iam.gserviceaccount.com`) with the
**Developer** role. Skipping this is the usual cause of a 403 on the first API
call: the key is valid, but it has no rights on the issuer.

If issuance starts reporting `class_http_403` or `object_http_403`, re-check
this first.

### 1.7 Extract the values

From the downloaded JSON:

| JSON field | Environment variable |
| --- | --- |
| `client_email` | `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` |
| `private_key` | `GOOGLE_WALLET_PRIVATE_KEY` |

`private_key` contains literal `\n` escapes. Keep them escaped when setting the
variable; the adapter will unescape. To pull both out without opening the file
in an editor:

```bash
jq -r '.client_email' ~/Downloads/opuspass-wallet-*.json
```

```bash
jq -r '.private_key' ~/Downloads/opuspass-wallet-*.json | head -1
```

Delete the JSON from `~/Downloads` once the values are in the secret store.

---

## Part 2 — Apple Wallet

About 45 minutes, assuming the Developer Program membership already exists.
Must be done on a Mac, and produces a certificate that **expires after one
year**.

### 2.1 Confirm the Developer Program membership

An active [Apple Developer Program](https://developer.apple.com/programs/)
membership is required (99 USD/year). A free Apple ID cannot create Pass Type
IDs. The account must be the OpusFesta organisation account.

### 2.2 Register the Pass Type ID

1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
2. **Identifiers → + → Pass Type IDs → Continue.**
3. Description: `OpusPass Entry Pass`.
   Identifier: `pass.com.opusfesta.opuspass.entry`

   This string is permanent and goes inside every pass. It cannot be renamed
   later, only replaced, which invalidates every pass issued under the old one.
4. **Continue → Register.**

This becomes `APPLE_WALLET_PASS_TYPE_ID`.

### 2.3 Generate a certificate signing request

Apple's own instructions use Keychain Access. The `openssl` route below is
equivalent, scriptable, and keeps the private key in a file you control rather
than in the login keychain, which matters because that key has to be exported
again at every renewal.

```bash
mkdir -p ~/opuspass-wallet-certs && cd ~/opuspass-wallet-certs
```

```bash
openssl genrsa -out passtype.key 2048
```

```bash
openssl req -new -key passtype.key -out passtype.certSigningRequest -subj "/emailAddress=dev@opusfesta.com/CN=OpusPass Entry Pass/C=TZ"
```

Keep `passtype.key`. Without it the downloaded certificate is useless.

### 2.4 Issue the certificate

1. In the portal, open the Pass Type ID you just registered and click
   **Create Certificate**.
2. Upload `passtype.certSigningRequest`.
3. Download the resulting `.cer` (usually `pass.cer`).

### 2.5 Build the .p12

```bash
openssl x509 -inform DER -in ~/Downloads/pass.cer -out passtype.pem
```

```bash
openssl pkcs12 -export -inkey passtype.key -in passtype.pem -out passtype.p12
```

Choose a strong export password when prompted. That password becomes
`APPLE_WALLET_CERT_PASSWORD`.

### 2.6 Get the WWDR intermediate certificate

This is the step most guides omit and every first signing attempt fails on. A
`.pkpass` signature must include Apple's Worldwide Developer Relations
intermediate certificate, not just yours.

1. Download the current **Worldwide Developer Relations** certificate from
   [Apple's Certificate Authority page](https://www.apple.com/certificateauthority/)
   (currently the G4 intermediate).
2. Convert it:

```bash
openssl x509 -inform DER -in ~/Downloads/AppleWWDRCAG4.cer -out wwdr.pem
```

### 2.7 Find the Team ID

It is printed in the certificate itself, under `OU`:

```bash
openssl pkcs12 -in passtype.p12 -nokeys -passin pass:YOUR_PASSWORD | openssl x509 -noout -subject -dates
```

The output shows `UID=pass.com.opusfesta.opuspass.entry` (confirming the pass
type matches) and `OU=XXXXXXXXXX`, which is `APPLE_WALLET_TEAM_ID`. `notAfter`
is the expiry to calendar.

### 2.8 Encode for the environment

Vercel environment variables are strings, so both certificates go in as base64
on a single line:

```bash
base64 -i passtype.p12 | tr -d '\n' | pbcopy
```

```bash
base64 -i wwdr.pem | tr -d '\n' | pbcopy
```

---

## Environment variables

Set these on the `opus_pass` Vercel project (Production and Preview), and
locally in `apps/opus_pass/.env.local`.

```
GOOGLE_WALLET_ENABLED="true"
GOOGLE_WALLET_ISSUER_ID=""
GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL=""
GOOGLE_WALLET_PRIVATE_KEY=""

APPLE_WALLET_ENABLED="true"
APPLE_WALLET_PASS_TYPE_ID="pass.com.opusfesta.opuspass.entry"
APPLE_WALLET_TEAM_ID=""
APPLE_WALLET_CERT_P12_BASE64=""
APPLE_WALLET_CERT_PASSWORD=""
APPLE_WALLET_WWDR_CERT_BASE64=""
```

Both providers are behind their own flag, and both ship off, so the code can
merge and deploy before either account is finished.

### The one that is not provider-specific

```
ADMISSION_CREDENTIAL_KEYS='{"1":"<base64 32 bytes>"}'
ADMISSION_CREDENTIAL_KEY_VERSION="1"
```

No pass can be issued without this, whatever the provider flags say, because a
pass is a view of an admission credential and the credential is encrypted at
rest with this keyring. `walletIssuanceReady()` checks for it, so a deployment
missing it withholds the button rather than showing it and failing on tap.

**The same version must hold the same bytes everywhere that shares a database.**
Local, Preview and Production all point at one Supabase project, so a version
`1` with different bytes in two places means a credential minted in one fails
AES-GCM authentication in the other. Rotate by ADDING a version, never by
changing the bytes under an existing one:

```bash
node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
```

Old versions stay readable so tickets already in guests' hands keep working.

---

## Google issuance error codes

Issuance reports short codes rather than provider text, because Google echoes
the request in its error payloads and the request body contains the admission
credential. The codes appear in `wallet_passes.last_error_code`.

| Code | Meaning |
| --- | --- |
| `token_http_401` / `token_http_400` | The service-account key is wrong, revoked, or the clock is badly skewed. |
| `token_unreachable` | Could not reach `oauth2.googleapis.com`. |
| `class_http_403` / `object_http_403` | The service account is not a Developer on the issuer. See 1.6. |
| `class_http_404` after a create | The issuer ID is wrong. |
| `object_http_400` | The object was rejected. Usually a malformed class reference or a bad field. |
| `*_unreachable` | Network failure mid-issuance. Safe to retry; issuance is idempotent. |

Retrying is always safe: the class is upserted and the object's id is derived
from the credential, so a repeat produces the same object rather than a second
admission.

---

## Renewal, which is the part that bites

The Apple certificate expires **one year** after issue. When it lapses you can
neither sign new passes nor update existing ones, and the failure surfaces as
guests unable to add a pass rather than as an alert.

- Put `notAfter` from step 2.7 in a shared calendar with reminders at 90, 60,
  30 and 7 days.
- Keep `passtype.key` somewhere durable and secret. Renewal can reuse it:
  generate a fresh CSR, upload it, download the new `.cer`, and rebuild the
  `.p12`. If the key is lost, generate a new private key and certificate for
  the existing Pass Type ID, then replace the deployed certificate material.
- Google service account keys do not expire by default, but they can be
  disabled or rotated. The adapter reads them from the environment, so rotation
  is an env change and a redeploy.

## What must never happen

- Neither the `.p12`, the `passtype.key`, nor the Google JSON goes in the repo.
  `~/opuspass-wallet-certs` is outside the repo on purpose.
- No secret value gets pasted into a chat, an issue or a PR description.
- The Google service account gets the **Developer** role on the issuer, never
  Admin. Admin can change publishing state and manage users.
