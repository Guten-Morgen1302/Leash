# Leash design system and UI tokens

Source: /plan-design-review. Surface mode: OPERATE (app UI), with one authored Persuade moment on /demo. No mockups exist yet (designer needed an OpenAI key); these tokens are the contract until /design-consultation or /design-review refines them against rendered pixels.

Use scene: a PayPal engineer or devrel judge on a laptop in daylight, plus a phone for the approval page. Light surface. The look is not one of the three AI defaults (no cream+serif+terracotta, no near-black+neon, no hairline broadsheet+italic serif).

## Color (CSS variables)
| Token | Value | Use | Contrast |
|---|---|---|---|
| --bg | #F3F5F8 | page ground | n/a |
| --surface | #FFFFFF | grid, inputs, lanes body | n/a |
| --ink | #0C1424 | text, primary button fill | 16.5:1 on --bg |
| --ink-muted | #46506A | secondary text (tinted from ink hue, never neutral gray) | 7.1:1 on --bg |
| --line | #D3D9E3 | hairlines, grid borders | decorative |
| --allow / --allow-bg | #0F7B4B / #E3F3EA | ALLOWED | 5.3:1 / chip text on bg |
| --block / --block-bg | #B3261E / #FBE8E6 | BLOCKED | 6.1:1 |
| --escalate / --escalate-bg | #7A4F00 / #FFF0CF | ESCALATED | 6.4:1 |
| --link-visited | #4B3F72 | visited links | distinct from --ink |
One accent rule: status colors carry meaning only; there is no decorative accent. Primary buttons are --ink filled with --surface text. Status is never color-only: each chip pairs text with a glyph character (check, cross, exclamation) and a distinct shape (chip border style: solid, double, dashed).

## Type (two faces plus mono)
| Role | Face | Size / weight | Notes |
|---|---|---|---|
| UI + body | Instrument Sans | 16px / 400, line-height 1.5 | body never below 16px |
| Headings | Instrument Sans | h1 28/600, h2 20/600 | h1 max 28px, no oversized display |
| Data (amounts, ids, hashes) | IBM Plex Mono | 14px in grid, 16px elsewhere, tabular-nums | grid data is the one documented sub-16px exception |
| Outcome word (hero moment) | Instrument Sans | 32/600 | BLOCKED / ALLOWED / ESCALATED |
No Inter, Roboto, Arial or system-ui as primary. Fonts self-hosted (no CDN) so judges behind restrictive networks still see the design.

## Space, shape, depth
Scale 4/8/12/16/24/32/48. Space above a heading is 1.5x the space below it. Radius 6px on inputs/buttons/chips, 0 on lanes and grid (hairline borders). No shadows (depth by hairlines and surface/bg contrast). No gradients, blobs, icon-in-circle, emoji, colored left borders.

## Browser surfaces (themed from the palette)
Selection #CBD9F5 on --ink text; caret --ink; focus ring 2px --ink with 2px offset on every focusable element; thin scrollbars colored --line/--ink-muted; tabular-nums on all amounts; underline offset 3px.

## Motion
One authored moment: after "Run both lanes", the unguarded outcome appears first, then the guarded outcome slides up 12px over 250ms (exponential ease-out) from an already-visible default (content never hidden behind timing). Nothing else animates. `prefers-reduced-motion`: no movement, instant swap.

## Components (the whole vocabulary)
Top bar, ticket selector (segmented control), lane (column), outcome row, status chip, ledger grid (AG Grid themed to these tokens), approval panel, banner (reset/error), button (primary/secondary/destructive-outline), labeled textarea. Nothing else without a new decision.

## Brand and trademark
Wordmark "Leash" is text only. No PayPal logo, no PayPal brand colors; "PayPal sandbox" appears as plain text. The video must not include third-party trademarks, so live-fire proof is shown inside Leash's own ledger (refund id and status from the API response as monospace text) and never as dashboard footage. Re-check against the official Rules page before shooting.
