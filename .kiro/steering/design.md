---
inclusion: always
---
# Design (follow exactly; do not invent new styles)
- Use ONLY shadcn/ui components (Card, Button, Slider, Switch, Tabs, Badge, Alert, Tooltip, Skeleton).
  Install them via the shadcn MCP. No custom CSS files; Tailwind utilities only.
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