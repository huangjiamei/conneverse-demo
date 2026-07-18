<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Conneverse — standing context

This is Conneverse, an AI parts-procurement tool for auto repair shops.
Architecture: headless core with three shells (standalone app, embeddable
SMS panel, headless API). Five layers: Data → Resolution/Matching →
Optimization Engine → Trust/Guarantee → Experience.

Prime directives:

1. The sourcing UI is an embeddable component (`SourcingPanel`) receiving
   context via a swappable `ContextProvider` — never assume it owns the page.
2. Match number-to-number, not text-to-text — LLM only fills gaps numbers
   can't resolve, and hard guardrails run before any LLM judgment.
3. Delivery time is co-equal with price in every UI.
4. Warranty/guarantee badges are first-class on every result.
5. Design the miss case gracefully — never show a confident wrong part.
6. Supplier anonymization — the UI and every client-facing API response
   show brand/condition/warranty/quality/delivery but NEVER seller or
   channel identity; the only attribution is "Fulfilled by Conneverse."
   Seller identity exists only server-side.
7. No numeric quality scores in the UI — quality is expressed via grade
   tier badge (OEM genuine / Premium aftermarket / Value aftermarket),
   warranty term, and outcome evidence when available; the results header
   states "N matches met the Conneverse quality bar · M didn't and aren't
   shown"; the cheaper option carries "same guarantee as Option A." The
   continuous score exists only server-side for ranking, floor
   enforcement, and debug panels.

Optimizer: two stages — hard gates knock candidates out entirely (stock,
fitment risk, insufficient trust); only survivors get a weighted score.
Never let a low price "buy back" an unbuyable part in a single weighted
sum. Reference implementation: `docs/reference/Conneverse_Source_Optimizer_Demo.html`.

Design tokens: navy header, teal = Ready Now, amber = Best Price,
green = guarantees. Stack: Next.js App Router, React, TypeScript,
Tailwind v4.

Build-prompt roadmap and sequencing live in the companion doc
"Conneverse — Claude Build Prompts" (Cowork OS/Conneverse).
