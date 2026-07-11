# Conneverse — Trusted Parts Agent

AI parts-procurement for auto repair shops. Conneverse aggregates every
sourcing channel (marketplaces, distributor catalogs, DTC) into two
trustworthy picks — **Ready Now** and **Best Price** — with guaranteed
fitment, delivery, and returns, and never exposes which seller a part
came from. The only attribution a shop ever sees is "Fulfilled by
Conneverse."

**Live demo:** https://conneverse-demo.vercel.app
Pricing is simulated, but the architecture is the real product.

---

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Runs fully without any environment variables — the simulated connector
and deterministic part resolver cover the whole demo flow. Add the keys
below only to light up live eBay results and LLM gap-filling.

### Environment variables (optional)

Create `.env.local` (gitignored — never commit it):

```bash
# Live eBay marketplace connector. Without these, eBay is skipped and
# only the simulated supplier catalog is searched.
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...

# LLM gap-filling for free-text part resolution (claude-haiku-4-5).
# Without it, resolution is deterministic-only (taxonomy + synonyms).
ANTHROPIC_API_KEY=...

# HQ team dashboard's Notion task sync (only needed for /hq).
NOTION_TOKEN=...
NOTION_TASKS_DB_ID=...
```

Guardrails run **before** any LLM call, so the app is safe and useful
with no keys at all.

---

## Demo flow

1. Pick a vehicle — try **2022 Toyota Camry** (or enter a VIN).
2. Set **Job status**: *Car on lift* vs *Scheduled* — the one knob that
   re-ranks everything.
3. Pick a category/part — try **Electrical → Alternator** to see the
   urgency flip: on-lift prioritizes the same-day pick, scheduled
   prioritizes the cheaper one.
4. Compare qualified matches (sortable grid) or the two top picks; add
   to the quote; **Generate PDF Quote** for a dual-option customer sheet.

---

## Architecture

Headless core with three shells (standalone app, embeddable SMS panel,
headless API) across five layers: **Data → Resolution/Matching →
Optimization → Trust/Guarantee → Experience**.

Two-stage optimizer: **hard gates** (stock, fitment risk, trust floor,
account policy) knock candidates out entirely; only survivors get a
**weighted score**. A low price can never buy back an unbuyable part.
Weights derive from demand context (urgency, part criticality, vehicle
class) — see `src/lib/optimizer.ts`. Reference implementation:
`docs/reference/Conneverse_Source_Optimizer_Demo.html`.

### Prime directives

1. The sourcing UI is an embeddable `SourcingPanel` fed by a swappable
   `ContextProvider` — it never assumes it owns the page.
2. Match number-to-number; the LLM only fills gaps numbers can't; hard
   guardrails run before any LLM judgment.
3. Delivery time is co-equal with price everywhere.
4. Warranty/guarantee badges are first-class on every result.
5. Design the miss case gracefully — never show a confident wrong part.
6. **Supplier anonymization** — client surfaces show
   brand/condition/warranty/quality/delivery but **never** seller or
   channel identity. Seller identity exists server-side only.
7. **No numeric quality scores in the UI** — quality is a grade-tier
   badge (OEM Genuine / Premium Aftermarket / Value Aftermarket) plus
   warranty and outcome evidence. The continuous score is server-side
   only (ranking, floor enforcement, dev debug panel).

Full standing context lives in [`AGENTS.md`](AGENTS.md).

---

## Surfaces

| Route          | What it is                                             |
| -------------- | ------------------------------------------------------ |
| `/`            | Standalone shop app (sourcing + quote builder)         |
| `/login`       | Shop onboarding (name, labor rate, zip)                |
| `/orders`      | Orders board + part tracker + claims                   |
| `/analytics`   | Savings ledger                                         |
| `/ops`         | Internal console — photo curation, graduation, policy  |
| `/embed`       | Embeddable panel for host integration                  |
| `/embed-demo`  | Harness demonstrating the embed contract               |
| `/hq`          | Team dashboard (timezones, bottlenecks, Notion sync)   |

The client-facing API (`/api/search`, `/api/optimize`,
`/api/optimize-ro`, `/api/quotes`, `/api/orders`, …) is gated by a
session cookie and rate-limited. Every response is the anonymized public
projection — no seller identity crosses the wire. The embed contract is
documented in [`docs/embed.md`](docs/embed.md).

---

## Tech stack

- **Next.js 16** (App Router; middleware is `src/proxy.ts`)
- **TypeScript** + **Tailwind CSS v4**
- In-memory `DataStore` behind a swappable interface — resets on cold
  start (a real database is the natural next step)
- `jspdf` for quote/PO PDF generation

## Deploy

Pushes to `main` auto-deploy to Vercel. Set `EBAY_CLIENT_ID`,
`EBAY_CLIENT_SECRET`, and `ANTHROPIC_API_KEY` as Vercel environment
variables to enable live sourcing in production.
