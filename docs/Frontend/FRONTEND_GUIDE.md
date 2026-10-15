# Frontend

The browser application is a React 19 single-page app built by Vite. It uses a small pathname router in `web/src/main.tsx`, fetches the Express API directly, and is served from `web/dist` by the backend. There is no client-side state library or component framework.

## Routes

| Route | Component | Purpose |
|---|---|---|
| `/` and `/demo` | `Demo` | Compare the same synthetic agent request with and without the gate |
| `/approve/:id` | `Approve` | Review, approve, or deny one escalated action |
| `/ledger` | `Ledger` | Inspect up to 500 audit events and the verified chain head |
| `/author` | `Author` | Compile policy text into a non-active draft |
| `/mandate` | `Mandate` | Read the active mandate in plain language |
| `/proof` | `Proof` | Show recorded PayPal sandbox refunds and optional live re-reads |

Unknown browser paths render the demo page, while unknown `/v1/*` paths remain JSON 404s.

## Demo interaction

The demo fetches three tickets: a legitimate $18 item refund, an injected whole-order request that exceeds the hard maximum, and a $75 request that needs approval. Every run creates fresh backing data. The unguarded lane appears first; the guarded lane follows after a short authored delay. Reduced-motion CSS removes movement for users who request it.

For escalation, the approval link opens in a new tab. The clear token is read from the URL fragment and sent only in the approval POST. After approval, the original demo page asks the agent to retry; the retry is what executes the simulated refund.

## Design system

Visual rules are centralized in `styles.css` and documented in the [design system](DESIGN_SYSTEM.md):

- Instrument Sans for interface text and IBM Plex Mono for IDs, hashes, and amounts.
- Light neutral surfaces with semantic green, red, and amber only for status.
- Status never depends on color alone: labels pair a glyph, word, and distinct border treatment.
- 4–48 px spacing scale, 6 px controls, no decorative gradients or shadows.
- Visible keyboard focus, 16 px body text, tabular numeric data, and a responsive approval layout.

AG Grid Community renders the ledger using a locally configured theme. Fonts are packaged through Fontsource, so the UI does not depend on a font CDN.

## API utility and error states

`web/src/ui.tsx` provides the fetch wrapper, money formatting, status chips, and mode indicator. Each page owns its loading and error state. The mode chip reads `/health` and labels the application `SIMULATED`, `LIVE-FIRE (PayPal sandbox)`, or `OFFLINE`.

The approval page refreshes after a decision, shows a live expiry countdown, disables actions after use or expiry, and clearly states that approval itself did not refund anything. The ledger labels the limited tamper-evidence claim rather than presenting the chain as tamper-proof.

## Build and development

```bash
npm run web:typecheck
npm run web:build
```

Vite’s project root is `web/` and its output is `web/dist`. The production server only enables SPA static routing if that directory exists. For a complete local experience, use `npm run demo`, which builds first and then starts Express.

## Adding a page

Create the component under `web/src`, add pathname selection and navigation in `main.tsx`, use the shared API and status primitives where appropriate, and add backend routes under `/v1`. Preserve direct-link behavior through the Express SPA fallback, keyboard focus, explicit loading/error states, and text equivalents for every status color.
