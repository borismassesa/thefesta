# opus_scanner (deprecated)

Door check-in now lives **inside OpusPass** at `/entrance-card-scanner`.

- Entry: `https://opuspass.opusfesta.com/entrance-card-scanner`
- Share link: `{opus_pass}/entrance-card-scanner/event/{eventId}?token={doorCode}`

This package remains only as a **compatibility redirect** to that path (see `next.config.ts`). Do not add features here.

Admin env: `NEXT_PUBLIC_OPUS_SCANNER_URL=https://opuspass.opusfesta.com/entrance-card-scanner` (dev: `http://localhost:3008/entrance-card-scanner`).
