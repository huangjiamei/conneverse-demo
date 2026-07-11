# Conneverse Embed Contract (v0)

The Conneverse sourcing panel embeds into a host shop-management system
(SMS) as an iframe. The host opens it per repair-order line, the
advisor sources the part inside the panel, and the selected line(s)
post back to the host. This document is the integration spec for SMS
marketplace partners.

Working reference implementation: `/embed-demo` in this repo — a fake
host estimate screen wired to the real embed.

---

## 1. Opening the embed

```
https://<conneverse-host>/embed
  ?year=2022&make=Toyota&model=Camry     ← vehicle (required)
  &desc=Front%20brake%20pad%20set        ← RO line description (recommended)
  &partId=brake-pad-front                ← Conneverse part id if known (optional)
  &qty=1                                 ← line quantity (optional, default 1)
  &origin=https://app.hostsms.com        ← host origin for postMessage (required in production)
  &bg=%23f1f5f9&surface=%23ffffff        ← host theme neutrals (optional)
  &text=%23111827&accent=%232563eb
```

| Param | Required | Meaning |
|---|---|---|
| `year`, `make`, `model` | yes* | Vehicle context. The panel pre-fills and searches immediately. |
| `desc` (alias `line`) | recommended | The RO line's free-text description. Pre-fills the part search; the resolution layer normalizes shorthand ("RT fender liner"). |
| `partId` | optional | Conneverse catalog part id. When present the panel skips straight to sourcing results. |
| `qty` | optional | Line quantity. Default 1. |
| `origin` | production: yes | The host's origin. All `postMessage` traffic from the embed targets this origin. `*` is tolerated only for local demos. |
| `bg`, `surface`, `text`, `accent` | optional | Host theme neutrals (URL-encoded hex). See §4. |

\* Vehicle may instead arrive via `conneverse:context` (§3) — the embed
renders a waiting state until one of the two arrives.

## 2. Receiving lines back (host ← embed)

Listen for `message` events. Verify **both** `event.origin` (the
Conneverse host) and `event.source` (your iframe's `contentWindow`).

```js
window.addEventListener("message", (e) => {
  if (e.origin !== "https://<conneverse-host>") return;
  if (e.source !== iframe.contentWindow) return;
  if (e.data?.type === "conneverse:quote-complete") {
    for (const line of e.data.lines) {
      // write line into your estimate
    }
  }
});
```

### `conneverse:quote-complete` payload

```jsonc
{
  "type": "conneverse:quote-complete",
  "lines": [
    {
      "description": "Front Brake Pad Set",
      "brand": "Wagner",
      "partNumber": "CBP-7301",
      "qty": 1,
      "unitPrice": 38.0,
      "warranty": "12 mo warranty",
      "delivery": "Ready tomorrow by 10 AM — Guaranteed",
      "gradeTier": "premium_aftermarket",   // oem_genuine | premium_aftermarket | value_aftermarket
      "option": "A",                         // A = Ready Now, B = Best Price
      "attribution": "Fulfilled by Conneverse"
    }
  ]
}
```

Notes:
- **Seller identity never appears** — pricing, brand, tier, warranty,
  and delivery are attributable only to "Fulfilled by Conneverse."
  This is by design and non-negotiable.
- Multiple lines arrive when the advisor sourced more than one part in
  a single embed session.

## 3. Events summary

| Direction | `type` | When |
|---|---|---|
| embed → host | `conneverse:ready` | Panel mounted and listening. |
| embed → host | `conneverse:quote-complete` | Advisor hit "Send to estimate". Payload above. |
| host → embed | `conneverse:context` | Alternative to URL params: `{ type, vehicle: {year, make, model}, line?: {description, partId?, qty?} }`. Send after `conneverse:ready`. |

## 4. Theming

The embed accepts host **neutrals** so it doesn't clash with your UI:
page background (`bg`), card surface (`surface`), text (`text`), and
the primary action color (`accent` — used on the "Send to estimate"
button).

**Conneverse teal on guarantee badges is not themable.** The
fitment/returns/delivery guarantee marks stay visually consistent
across every host — that recognizability is part of the guarantee.

## 5. Security & serving notes

- **Frame ancestors**: production Conneverse sends
  `Content-Security-Policy: frame-ancestors <allowlisted hosts>`.
  Integration partners are added to the allowlist.
- **postMessage origins**: the embed only posts to the `origin` you
  pass; always verify `event.origin` + `event.source` on your side.
- **Cookies**: the embed's API session cookie is `SameSite=Lax`, which
  works when the embed is same-site with the Conneverse host (as in
  `/embed-demo`). Cross-site production embedding requires the session
  cookie to be issued `SameSite=None; Secure` — enabled per-partner.
- **No PII in URLs**: pass RO line descriptions and vehicle only; never
  customer names/contacts in query params. Use `conneverse:context`
  for anything sensitive.

## 6. What the host never has to build

Sourcing UI, supplier connections, fitment verification, quality
gating, price/delivery optimization, PO routing, returns/claims — the
embed carries the full Conneverse stack. The host integration is:
one button, one iframe, one message listener.
