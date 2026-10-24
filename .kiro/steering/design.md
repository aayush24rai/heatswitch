---
inclusion: always
---
# Design (follow exactly; do not invent new styles)
- Use ONLY shadcn/ui components (Card, Button, Slider, Switch, Tabs, Badge, Alert, Tooltip, Skeleton).
  Install them via the shadcn MCP. No custom CSS files; Tailwind utilities only — with ONE sanctioned exception: a single `.liquid-glass` utility (and its `::before`) in `app/globals.css`, used only by the My home empty-state photo hero.
- Theme: shadcn/create preset with base color Mist, theme Emerald, chart color Emerald (scaffolded from the preset; do not hand-edit colors). Light mode only.
- Font: Inter via next/font. Sizes: verdict text-4xl font-semibold; section titles text-lg font-medium; body text-sm.
- Layout: max-w-5xl mx-auto px-6 py-10; cards rounded-2xl border shadow-sm p-6; gap-6 between cards.
- Colors: savings = emerald-600 (the theme primary); extra cost = amber-600; never red. Numbers in tabular-nums.
- Every number has a small grey source link or tooltip beneath it.
- Confirmations are inline, never modals or new tabs: show the best-guess result immediately; uncertain fields get an amber outline + the bill text they came from + [Looks right] [Edit] (edit in place); a banner above the verdict reads "Estimate: N values need a quick check" and scrolls to them; heating type is a chip "Looks like gas heat. [Yes] [Change]". Verdict label switches from "Estimate" to "Based on your bill" once nothing is amber. Recalculate live.

## Wireframe (desktop; stack vertically on mobile)
[Header: "HeatSwitch" + tagline "Know before you switch" | badge "Massachusetts"]
[Tabs: "My home" | "Buildings (landlords & city)"]

TAB 1 — My home

EMPTY STATE (before any demo/bill is loaded): full-screen photo hero.
- Full-viewport `public/hero.jpg` background via next/image fill, object-cover, with a
  slow 20s scale 1→1.06 animation.
- A bottom-only legibility gradient over the photo.
- An absolutely-positioned glass navbar: HeatSwitch / How it works / Buildings / Sources /
  "Try a demo".
- Bottom-pinned hero content: animated heading "Should your Boston home switch to a heat
  pump?", a subhead, "Upload your bill" + "Try a demo home" buttons (the latter reveals the
  three demo pills), a small glass panel with the zip field + "Heat included in my rent"
  toggle, and a right-column glass tag "Renters. Homeowners. Buildings."
- Loading a demo or a bill smooth-scrolls down to the existing light Mist/Emerald RESULTS
  layout below the hero.
- The RESULTS state and the Buildings tab keep the existing light layout unchanged.
- `prefers-reduced-motion` disables all hero animations (everything is shown immediately).

RESULTS STATE (after a demo/bill is loaded; existing light layout, unchanged):
[Upload card: drop zone (bill photo/PDF) + zip code field + toggle "Heat included in my rent"
              + 3 buttons "Try: Oil home / Gas home / Baseboard home"]
[Left col 60%: Verdict card (verdict label: Switch now / Switch when your system needs
                 replacing / Not worth it yet; "Act before Dec 31" badge when relevant;
                 big annual number; AI explanation; language dropdown)
               Cost chart card (current vs heat pump bars + breakeven COP)]
[Right col 40%: Your numbers card (editable fields, bill text under each, amber = confirm;
                 heating-type chip)
                Assumptions card (sliders + heat pump rate switch)
                Rebates card (amount, net cost, payback, requirements checklist,
                 renter/landlord path when the rent toggle is on)]
[Next step row: "Free Boston Energy Saver consultation" (Boston zips) | "Mass Save Home
                 Energy Assessment"; enhanced-incentive notice for equity zips]
[Collapsible: "How we calculate" (formulas, assumptions, sources)]

TAB 2 — Buildings (landlords & city)
[Zip picker + ranked table of Boston multifamily buildings by heat pump opportunity
 (type, year built, area, energy use, emissions, electric/gas share, opportunity label);
 source: City of Boston BERDO 2021]

[Footer: sources list + "Your bill is never stored"]

Visual reference: docs/design/reference.png (match its card style, spacing and number styling).