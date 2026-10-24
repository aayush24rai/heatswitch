---
inclusion: always
---

# HeatSwitch

Honest heat pump answers for Boston's renters, landlords, homeowners, and the city
program that serves them (Boston Energy Saver).

## What it does
- A household uploads a gas/electric bill (or enters oil gallons + price, or clicks a
  Try demo home). The app shows current heating cost vs heat pump cost, breakeven COP,
  Massachusetts seasonal heat pump rate on/off, Mass Save rebates, net install cost,
  payback, and a plain-English verdict.
- Verdict labels: "Switch now", "Switch when your system needs replacing",
  "Not worth it yet", plus an "act before Dec 31" flag when the rebate deadline matters.
- Every number extracted from a bill shows the exact bill text it came from.
  Uncertain values are amber and confirmed inline.
- Renters: if heat is included in rent or they can't install, show a landlord path.
- Building view: rank Boston multifamily buildings by heat pump opportunity using the
  official Hackachusetts C2 dataset (BERDO 2021).
- Explanations available in English, Spanish, Cape Verdean Creole, Chinese,
  Haitian Creole, Vietnamese. Numbers always come from code.
- Next step: Boston Energy Saver consultation for Boston zips; Mass Save assessment elsewhere.

## Principles
- Honesty over persuasion: if a heat pump doesn't save money (often true vs gas), say so.
- The AI reads documents and writes explanations. It never computes a number.
- No installer lead fees, no stored bills.

## Context
Hackachusetts 2026, track Climatech & Clean Energy, Challenge C2
(Cleaner, more affordable buildings). Demo must be clear in under 2 minutes.