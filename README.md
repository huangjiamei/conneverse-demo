# Conneverse Demo — Trusted Parts Agent

## What this is
Interactive demo of Conneverse's parts procurement tool for auto care shops.
Shows quality-vetted supplier comparison with guaranteed fitment, delivery, and returns.

## Run locally
```
npm install
npm run dev
```
Open http://localhost:3000

## Deploy to Vercel (free)
```
npx vercel
```
Follow prompts, deploy in ~2 minutes.

## Tech stack
- Next.js 14 (App Router)
- TypeScript + Tailwind CSS
- jspdf for PDF generation
- All data is simulated — no backend or database required

## Demo flow
1. Select a vehicle (try: 2022 Toyota Camry)
2. Select a category (try: Brakes)
3. See two quality-vetted options: Ready Now vs. Ready Tomorrow
4. Add both to the quote
5. Click "Generate PDF Quote" — download the dual-option customer quote
