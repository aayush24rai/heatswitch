/**
 * Plain-English glossary for HeatSwitch.
 *
 * Every technical term the UI shows has a short, friendly definition here — the
 * kind a 15-year-old understands, with no jargon inside the definition. The
 * InfoTip component (`components/shared/info-tip.tsx`) reads a definition by its
 * stable key and shows it in a tooltip on hover and keyboard focus.
 *
 * Keep each definition to 1–2 sentences (≈160 characters max) so it fits a
 * compact tooltip. These are explanatory text only; no number here is ever used
 * in a calculation.
 */
export const GLOSSARY = {
  heatPump:
    "A device that heats (and cools) your home by moving heat instead of burning fuel. It runs on electricity and is very efficient.",
  cop: "How much heat a heat pump gives you for the electricity it uses. A COP of 3 means 3 units of heat per 1 unit of electricity — higher is better.",
  breakEvenEfficiency:
    "How efficient a heat pump would need to be to cost the same as your heating now. Most heat pumps in Boston average about 2.5. Above the break-even you save; below it you pay more.",
  seasonalHeatPumpRate:
    "A cheaper Massachusetts electricity rate for homes with heat pumps during heating months, which lowers the cost of running one.",
  therms:
    "The unit gas is measured and billed in. One therm is a set amount of heat energy — your gas bill shows how many you used.",
  kwh: "A kilowatt-hour: the unit electricity is measured and billed in. Your electric bill shows how many kWh you used.",
  pricePerKwh:
    "How much you pay for one kilowatt-hour of electricity. Multiply it by the kWh you use to get the cost.",
  massSave:
    "A Massachusetts program run by the utilities that offers rebates, free assessments, and help making your home more efficient.",
  rebateTier:
    "Which level of Mass Save rebate you get: Standard for most homes, Enhanced for moderate incomes, and Income Eligible for lower incomes (the largest).",
  netInstallCost:
    "What installing a heat pump actually costs you after the rebate is subtracted from the full price.",
  payback:
    "How many years of energy savings it takes to earn back what you spent to install the heat pump.",
  homeEnergyAssessment:
    "A free Mass Save visit where an expert checks your home's energy use and sets you up to qualify for rebates.",
  weatherization:
    "Sealing air leaks and adding insulation so your home holds heat better. It's often required before a rebate and makes a heat pump work best.",
  networkInstaller:
    "A contractor approved by Mass Save. Using one is usually required for your rebate to count.",
  refrigerant:
    "The special fluid inside a heat pump that carries heat in and out of your home. R-32 and R-454B are newer, lower-impact types.",
  tons: "A way to measure how much heating or cooling an installed heat pump can deliver. More tons means it can heat a bigger space.",
  bostonEnergySaver:
    "The City of Boston's free program that helps Boston residents cut energy costs and plan upgrades like heat pumps.",
  equityZip:
    "A neighborhood the state focuses extra support on. It's informational only — being in one does not change the rebate amount you see.",
  berdo:
    "Boston's Building Energy Reporting and Disclosure Ordinance. Larger buildings report their energy use, and that public data powers this ranking.",
  siteEui:
    "Energy used per square foot of a building in a year. Higher means the building uses more energy for its size.",
  ghgEmissions:
    "The greenhouse gas pollution (in tons of CO₂) a building releases in a year, mostly from the fuel it burns for heat and hot water.",
  electricShare:
    "The portion of a building's energy that comes from electricity rather than gas or oil.",
  gasShare:
    "The portion of a building's energy that comes from natural gas rather than electricity or oil.",
  opportunityScore:
    "A rough ranking of how much a building could gain by switching to heat pumps, based on its energy use and fuel mix.",
  checkData:
    "This building's reported numbers look unusually high, so double-check them before trusting the figure.",
  sharesDontAddUp:
    "The electric and gas portions reported for this building add up to more than 100%, so the fuel mix may be off.",
  likelyElectricResistance:
    "This all-electric building probably uses old electric baseboard heat, which is expensive — switching to a heat pump is the biggest win.",
  convertAtBoiler:
    "This older, mostly-gas building is a good candidate to switch to a heat pump when its gas boiler is due for replacement.",
  annualHeatingUse:
    "How much fuel or electricity you use for heating in a year — in therms (gas), gallons (oil/propane), or kWh (electricity).",
  estimate:
    "A first-pass number based on what we read. Confirm or fix the amber fields to turn the estimate into an answer based on your bill.",
  energyUse:
    "How much energy this building uses for its size, compared with a typical Boston apartment building. Higher means more room to cut waste.",
  typical:
    "The middle (median) value across the apartment buildings shown. Half use more, half use less — a fair yardstick to compare against.",
  heatingFuel:
    "What this building mostly burns or uses for heat: natural gas, oil, or electricity. Gas and oil are the ones a heat pump replaces.",
  priority:
    "How strong a heat-pump opportunity this building is — High, Medium, or Low — based on its energy use and how much fossil fuel it burns.",
  kbtuPerSqFt:
    "A unit for building energy use: thousands of BTUs of energy per square foot per year. Lower is more efficient.",
} as const

/** A valid glossary key — the keys of {@link GLOSSARY}. */
export type GlossaryKey = keyof typeof GLOSSARY
