# Requirements Document

## Introduction

HeatSwitch is a single-page Next.js (App Router) application that gives Boston households an honest answer to whether they should switch their heating to a heat pump. A user uploads a gas, electric, or oil bill (or enters oil gallons and price, or clicks a demo home) and the application shows current heating cost versus heat pump cost, breakeven COP, whether the Massachusetts seasonal heat pump electric rate helps, Mass Save rebates, net install cost, payback, and a plain-English verdict. Renters and landlords get a tailored path, and a Buildings tab ranks Boston multifamily buildings by heat pump opportunity from the City of Boston BERDO 2021 dataset.

These requirements are derived from the finalized design document (`design.md`) and the product, tech, and design steering files. The design is authoritative; every requirement below is consistent with it. The overriding product rule is that the LLM never computes a number: all arithmetic lives in pure, deterministic TypeScript functions (`lib/calc.ts`, `lib/rebates.ts`) that are property-tested, and the LLM is confined to extracting fields from bills and writing explanation prose from numbers the code provides.

## Glossary

- **HeatSwitch**: The complete single-page web application described in this document.
- **Calculation_Engine**: The pure, deterministic functions in `lib/calc.ts` and `lib/rebates.ts` that perform all arithmetic. Performs no I/O and makes no network calls.
- **Extraction_Service**: The server-side route `app/api/extract` that makes a real Anthropic SDK call (model `claude-sonnet-5-5`) to extract bill fields into Zod-validated JSON.
- **Explanation_Service**: The server-side route `app/api/explain` that makes a real Anthropic SDK call (model `claude-sonnet-5-5`) to write explanation prose from numbers provided by the Calculation_Engine.
- **Intake_UI**: The UploadCard component and related state that collect a bill, oil input, demo selection, zip code, and rent toggle.
- **Confirmation_UI**: The inline confirmation mechanism (ConfirmField, banner, heating-type chip) that shows best-guess values and lets a user confirm or edit amber fields in place.
- **Verdict_Engine**: The `decideVerdict` function that selects exactly one verdict label.
- **Buildings_View**: The Buildings tab (BuildingsTable, ZipPicker) that ranks BERDO 2021 buildings.
- **ExtractionResult**: The Zod schema shape `{ heatingType, annualFuelUse?, fuelUnitPrice? }`, where each field carries a value, a confidence in `[0,1]`, and exact evidence text.
- **Confidence_Threshold**: The value `CONFIDENCE_THRESHOLD = 0.8`. A field with confidence below this value is shown amber for confirmation.
- **HomeInputs**: The normalized inputs that drive all calculations: heating type, annual fuel use, fuel unit price, zip, utility, rent flag, household size, optional annual income.
- **Assumptions**: User-adjustable knobs: heat pump COP, electricity price, seasonal heat pump rate on/off, seasonal rate discount per kWh, system efficiency per type, heat pump tons, gross install cost.
- **Breakeven_COP**: The coefficient of performance at which heat pump annual cost equals current heating annual cost.
- **Seasonal_Rate**: The Massachusetts seasonal heat pump electric rate, modeled as a flat $/kWh discount subtracted from the electricity price, defaulted by utility.
- **Rebate_Tier**: One of `"standard"`, `"enhanced"`, or `"income-eligible"`, selected from household size and income.
- **BerdoBuilding**: A cleaned row from the BERDO 2021 dataset with zip, property type, year built, floor area, site EUI, GHG emissions, electric share, and nullable gas share.
- **Opportunity_Score**: The numeric heat pump opportunity score for a building; higher means greater opportunity.
- **Opportunity_Label**: One of `"High"`, `"Medium"`, `"Low"`, derived from a building's percentile within the multifamily cohort.
- **Boston_Zip**: A five-digit zip code served by the Boston Energy Saver program.
- **Equity_Zip**: A zip code eligible for an informational enhanced-incentive notice; equity status never changes a rebate amount.
- **Supported_Language**: One of English, Spanish, Cape Verdean Creole, Chinese, Haitian Creole, Vietnamese.
- **Rebate_Deadline**: Dec 31, 2026 (`REBATE_DEADLINE_2026`), the install deadline for 2026 Mass Save rebates.

## Requirements

### Requirement 1: Bill and input intake

**User Story:** As a Boston household, I want to provide my heating information by uploading a bill, entering oil details, or trying a demo home, so that I can get a heat pump answer with minimal effort.

#### Acceptance Criteria

1. WHEN a user selects or drops a gas or electric bill file of type JPEG, PNG, or PDF that is 10 MB or smaller, THE Intake_UI SHALL hand the file to the Extraction_Service for field extraction.
2. IF a user selects or drops a file whose type is not JPEG, PNG, or PDF, or whose size exceeds 10 MB, THEN THE Intake_UI SHALL reject the file, retain any previously entered inputs unchanged, and display a message indicating the accepted file types and the 10 MB size limit.
3. IF the Extraction_Service fails to return an ExtractionResult, or returns a result in which no field has a confidence at or above the Confidence_Threshold, THEN THE Intake_UI SHALL display the manual input form with any successfully extracted field values pre-filled and a message indicating that extraction could not be completed.
4. WHERE a user has oil heating, THE Intake_UI SHALL accept an annual oil gallons value from 1 to 5000 and an oil unit price value from 0.01 to 99.99 United States dollars per gallon as manual inputs.
5. IF a user submits an oil gallons value outside 1 to 5000 or an oil unit price value outside 0.01 to 99.99, THEN THE Intake_UI SHALL reject the input, retain the prior valid value, and display a message indicating the accepted range for that field.
6. WHEN a user clicks a demo button (Oil, Gas, or Baseboard), THE Intake_UI SHALL load that demo's cached ExtractionResult containing a value, confidence, and evidence text for each field without calling the Extraction_Service.
7. THE Intake_UI SHALL accept a five-digit zip code input matching the pattern `^\d{5}$`.
8. IF a user submits a zip code value that does not match the pattern `^\d{5}$`, THEN THE Intake_UI SHALL reject the input and display a message indicating that a five-digit zip code is required.
9. THE Intake_UI SHALL provide a "Heat included in my rent" toggle whose state is stored in HomeInputs as `heatIncludedInRent`.
10. WHEN the Gas demo is loaded, THE Intake_UI SHALL present exactly one field with confidence below the Confidence_Threshold.
11. WHEN a demo ExtractionResult is loaded, THE Intake_UI SHALL route it through the same Zod validation and confirmation path used for a real uploaded bill.

### Requirement 2: Bill field extraction

**User Story:** As a user uploading a bill, I want the system to read my bill fields with their supporting evidence, so that I can trust and confirm the extracted values.

#### Acceptance Criteria

1. WHEN a bill is submitted, THE Extraction_Service SHALL return, for each extracted field, a numeric or enumerated value, a confidence as a decimal in the inclusive range 0.0 to 1.0, and the exact evidence text from the bill.
2. WHERE the Extraction_Service cannot find supporting evidence for a field, THE Extraction_Service SHALL omit that field rather than fabricate a value or evidence.
3. THE Extraction_Service SHALL make a real Anthropic SDK call using model `claude-sonnet-5-5` and SHALL read the API key only from `process.env.ANTHROPIC_API_KEY` on the server.
4. THE Extraction_Service SHALL extract field values only and SHALL NOT compute any derived number.
5. IF the Extraction_Service does not return within 30 seconds, THEN THE HeatSwitch SHALL treat the request as failed and fall back to the manual form with any known fields pre-filled.
6. WHEN the Extraction_Service returns output, THE HeatSwitch SHALL validate that output against `ExtractionResultSchema` before using it.
7. IF the extraction output fails `ExtractionResultSchema` validation or the Extraction_Service errors or times out, THEN THE HeatSwitch SHALL display the manual form with all known fields pre-filled and indicate that extraction was unsuccessful.
8. WHERE an extracted field has a confidence strictly below the Confidence_Threshold of 0.8, THE Confirmation_UI SHALL render that field with an amber outline and display its evidence text inline.

### Requirement 3: Inline confirmation experience

**User Story:** As a user reviewing extracted values, I want to confirm or correct uncertain values in place, so that I can quickly reach a trusted result without interruptions.

#### Acceptance Criteria

1. WHEN extraction or demo data is loaded, THE Confirmation_UI SHALL display the best-guess value for every field within 1 second, with no field left blank.
2. WHERE a field is unconfirmed and its confidence is below the Confidence_Threshold of 0.8, THE Confirmation_UI SHALL render the field with an amber outline, display the field's exact evidence text, and present a "Looks right" action and an "Edit" action.
3. WHEN a user activates the "Edit" action on an amber field, THE Confirmation_UI SHALL enable editing of that field's value in place within the same view, without opening a modal or a new tab.
4. WHEN a user activates "Looks right" on an amber field, THE Confirmation_UI SHALL mark that field confirmed, remove its amber outline, and decrement the amber-field count N by 1.
5. WHILE the amber-field count N is 1 or greater, THE Confirmation_UI SHALL display a banner above the verdict reading "Estimate: N values need a quick check", where N is the current integer count of amber fields and updates whenever N changes.
6. WHEN a user activates the "Estimate: N values need a quick check" banner, THE Confirmation_UI SHALL scroll the view so that the first amber field is visible within 1 second.
7. THE Confirmation_UI SHALL display the heating type as a chip reading "Looks like gas heat." with a "Yes" action and a "Change" action.
8. WHILE the amber-field count N is 1 or greater, THE Verdict_Engine result display SHALL label the verdict "Estimate".
9. WHEN the amber-field count N reaches 0, THE Verdict_Engine result display SHALL label the verdict "Based on your bill".
10. WHEN a user confirms a field via "Looks right" or commits an edited field value, THE Calculation_Engine SHALL recompute all results and update the displayed results within 1 second.
11. IF a user commits an edited field value that fails validation, THEN THE Confirmation_UI SHALL reject the value, retain the field in edit mode with the prior confirmed value preserved, and display an error indication describing the expected format or range.

### Requirement 4: Current heating cost and heat pump cost calculations

**User Story:** As a household, I want an accurate side-by-side cost of my current heating versus a heat pump, so that I can make an honest financial decision.

#### Acceptance Criteria

1. THE Calculation_Engine SHALL compute current heating cost as `annualFuelUse * fuelUnitPrice`, rounded to 2 decimal places for display.
2. WHEN given exactly 12 monthly readings, THE Calculation_Engine SHALL compute annual heating use as `sum(history) - 12 * min(history over Jun through Sep)`.
3. IF the monthly history is not exactly 12 readings or contains any value less than 0, THEN THE Calculation_Engine SHALL reject the input and indicate the error, retaining the previously computed value.
4. FOR ALL 12-month histories whose elements are each greater than or equal to 0, THE Calculation_Engine SHALL return an annual heating use satisfying `0 <= result <= sum(history)`.
5. THE Calculation_Engine SHALL convert fuel use to delivered heat energy in kWh-equivalent using source-cited constants and SHALL apply the per-heating-type system efficiency of gas 0.90, oil 0.82, electric-resistance 1.0, and propane 0.85.
6. IF the heating type is not one of gas, oil, electric-resistance, or propane, THEN THE Calculation_Engine SHALL reject the input and indicate the error, retaining the previously computed value.
7. WHEN fuel use is 0, THE Calculation_Engine SHALL return 0 delivered heat energy for any supported heating type and any efficiency greater than 0.
8. FOR ALL positive scale factors k, THE Calculation_Engine SHALL satisfy `currentHeatingCost({...inputs, annualFuelUse: k*u}) === k * currentHeatingCost({...inputs, annualFuelUse: u})`.
9. THE Calculation_Engine SHALL compute Breakeven_COP, in the inclusive range 0.01 to 10.0, as the coefficient of performance at which heat pump annual cost equals current heating annual cost.
10. WHEN the Assumptions heat pump COP is greater than Breakeven_COP, THE Calculation_Engine SHALL report a positive annual dollar delta (savings), and WHEN the heat pump COP is less than Breakeven_COP THE Calculation_Engine SHALL report a non-positive annual dollar delta.
11. WHERE the Seasonal_Rate is on, THE Calculation_Engine SHALL subtract a flat per-kWh discount, defaulted by utility to Eversource 0.073, National Grid 0.042, and Unitil 0.065, from the electricity price, flooring the resulting price at a minimum of 0.
12. FOR ALL inputs and assumptions with seasonal rate discount per kWh greater than or equal to 0, THE Calculation_Engine SHALL satisfy `heatPumpCost(inputs, {...a, seasonalHeatPumpRate: true}) <= heatPumpCost(inputs, {...a, seasonalHeatPumpRate: false})`.
13. FOR ALL pairs of assumptions differing only by heat pump COP with the first COP less than the second, THE Calculation_Engine SHALL satisfy `heatPumpCost(inputs, a1) > heatPumpCost(inputs, a2)`.
14. THE Calculation_Engine SHALL compute the annual dollar delta as `currentAnnualCost - heatPumpAnnualCost`.

### Requirement 5: Mass Save rebates and payback

**User Story:** As a household considering a heat pump, I want to see my Mass Save rebate, net cost, and payback with eligibility requirements, so that I understand the real financial picture.

#### Acceptance Criteria

1. WHEN annual income is absent, THE Calculation_Engine SHALL select the Standard Rebate_Tier.
2. WHEN annual income is present and at or below the Enhanced threshold for the household size, THE Calculation_Engine SHALL select the Enhanced tier; WHEN annual income is present, above the Enhanced threshold, and at or below the Income Eligible threshold for the household size, THE Calculation_Engine SHALL select the Income Eligible tier; WHEN annual income is present and above the Income Eligible threshold for the household size, THE Calculation_Engine SHALL select the Standard tier.
3. IF household size is absent or not an integer in the range 1 to 8 inclusive, THEN THE Calculation_Engine SHALL select the Standard tier and SHALL expose a flag indicating the household size was invalid.
4. WHERE the Rebate_Tier is Standard or Enhanced, THE Calculation_Engine SHALL compute the uncapped rebate as `min(2650 * heatPumpTons, 8500)`, where heatPumpTons is a value in the range 0.5 to 5.0 inclusive.
5. WHERE the Rebate_Tier is Income Eligible, THE Calculation_Engine SHALL set the rebate to the lesser of the uncapped rebate and installCostGross, allowing the rebate to reach the full gross install cost.
6. FOR ALL inputs and assumptions, THE Calculation_Engine SHALL satisfy `0 <= rebateAmount <= installCostGross` and `netInstallCost >= 0`.
7. THE Calculation_Engine SHALL compute net install cost as `installCostGross - rebateAmount`.
8. IF annual savings are less than or equal to 0, THEN THE Calculation_Engine SHALL set payback years to null; otherwise THE Calculation_Engine SHALL compute payback years as `netInstallCost / annualSavings` and SHALL return a value greater than or equal to 0.
9. THE Calculation_Engine SHALL NOT change the rebate amount based on Equity_Zip status.
10. THE HeatSwitch SHALL display the rebate eligibility checklist containing exactly these four items: Mass Save home energy assessment, weatherization, Mass Save network installer, and R-32 or R-454B refrigerant.
11. THE HeatSwitch SHALL display the note with the exact text "2026 rebates require install by Dec 31, 2026."
12. WHEN a rebate greater than 0 is available, the rebate reduces payback years by at least 1 year compared with payback computed from installCostGross, and the current date is on or before the Rebate_Deadline, THE Verdict_Engine SHALL set the "act before Dec 31" flag to true.
13. IF the current date is after the Rebate_Deadline, THEN THE Verdict_Engine SHALL set the "act before Dec 31" flag to false.

### Requirement 6: Verdict

**User Story:** As a household, I want one clear verdict and the annual dollar figure, so that I know the honest recommendation at a glance.

#### Acceptance Criteria

1. THE Verdict_Engine SHALL return exactly one verdict label from the set "Switch now", "Switch when your system needs replacing", and "Not worth it yet".
2. IF the annual dollar delta is less than or equal to 0, THEN THE Verdict_Engine SHALL return the label "Not worth it yet".
3. WHEN the annual dollar delta is greater than 0 and payback years are not null and payback years are less than or equal to 5, THE Verdict_Engine SHALL return the label "Switch now".
4. WHEN the annual dollar delta is greater than 0 and either payback years are null or payback years are greater than 5, THE Verdict_Engine SHALL return the label "Switch when your system needs replacing".
5. WHERE the annual dollar delta is greater than 0, THE HeatSwitch SHALL display the big annual number in the emerald savings color.
6. WHERE the annual dollar delta is less than 0, THE HeatSwitch SHALL display the big annual number in the amber extra-cost color and SHALL NOT use red.
7. WHERE the annual dollar delta is exactly 0, THE HeatSwitch SHALL display the big annual number in the neutral default text color and SHALL NOT use red.
8. WHERE the "act before Dec 31" flag is true, THE HeatSwitch SHALL display an "Act before Dec 31" badge on the verdict.

### Requirement 7: Renter and landlord path

**User Story:** As a renter, I want a landlord-focused path when I cannot install a heat pump myself, so that I still have a useful next step.

#### Acceptance Criteria

1. WHILE the "Heat included in my rent" toggle is on, THE HeatSwitch SHALL display the landlord path section containing a shareable summary of heat pump opportunity and the Mass Save landlord/multifamily next-step link.
2. WHEN the "Heat included in my rent" toggle changes to on, THE Verdict_Engine SHALL set `isRenter` to true.
3. WHEN the "Heat included in my rent" toggle changes to off, THE Verdict_Engine SHALL set `isRenter` to false and THE HeatSwitch SHALL hide the landlord path section.
4. IF `isRenter` is true AND the required household heating inputs for a shareable summary are not yet available, THEN THE HeatSwitch SHALL display the landlord path section with an inline message indicating which inputs are needed and SHALL retain any already-entered input values.

### Requirement 8: Buildings tab

**User Story:** As a landlord or city staff member, I want Boston multifamily buildings ranked by heat pump opportunity, so that I can target the biggest wins.

#### Acceptance Criteria

1. THE Buildings_View SHALL load the BERDO 2021 dataset client-side from a static JSON file.
2. IF the BERDO dataset fails to load, THEN THE Buildings_View SHALL display an error state indicating the building data is unavailable and SHALL keep the zip picker usable.
3. WHEN cleaning the dataset, THE Buildings_View SHALL drop rows that are missing site EUI, SHALL keep only rows whose zip is exactly five digits starting with "02", and SHALL assign each kept row an id equal to its zero-based source row index as a string.
4. WHERE a cleaned row has a site EUI greater than 300 kBtu/ft²/year, THE Buildings_View SHALL keep the row and flag it "check data".
5. WHERE the source has no gas fraction for a row, THE Buildings_View SHALL set gas share to null rather than 0.
6. THE Buildings_View SHALL rank buildings by Opportunity_Score descending and SHALL annotate each row with its percentile, in the inclusive range 0 to 100, within the multifamily cohort and the corresponding Opportunity_Label.
7. FOR ALL building lists and any valid five-digit "02" zip, THE Buildings_View ranking SHALL return exactly the zip-matching subset sorted by Opportunity_Score descending, adding no rows and dropping no matching rows.
8. WHERE a building has an electric share of 1 and a site EUI greater than 300 kBtu/ft²/year, THE Buildings_View SHALL show the message "likely electric resistance, biggest heat pump win".
9. WHERE a building has a gas share greater than or equal to 0.8 and a year built less than or equal to 1980, THE Buildings_View SHALL show the message "convert at boiler replacement".
10. WHEN a user selects a zip, THE Buildings_View SHALL filter the table to buildings whose zip equals the selected zip.
11. IF no buildings match the selected zip, THEN THE Buildings_View SHALL display an empty-state row indicating no buildings match and SHALL keep the zip picker usable.

### Requirement 9: Explanations in six languages

**User Story:** As a user, I want a plain-English or translated explanation of my result, so that I can understand the recommendation in my language.

#### Acceptance Criteria

1. WHEN an explanation is requested, THE HeatSwitch SHALL send only numbers already computed by the Calculation_Engine, the verdict, and the selected language to the Explanation_Service, and SHALL NOT send raw bill content.
2. THE Explanation_Service SHALL make a real Anthropic SDK call using model `claude-sonnet-5-5` and SHALL read the API key only from `process.env.ANTHROPIC_API_KEY` on the server.
3. THE Explanation_Service SHALL write prose only and SHALL NOT compute any number.
4. THE HeatSwitch SHALL offer explanation text in each Supported_Language: English, Spanish, Cape Verdean Creole, Chinese, Haitian Creole, and Vietnamese.
5. WHEN the selected language changes, THE HeatSwitch SHALL request a new explanation in that language while keeping all computed numbers visible.
6. WHILE the explanation is loading, THE HeatSwitch SHALL display a skeleton placeholder and SHALL keep all computed numbers visible.
7. IF the Explanation_Service does not respond within 30 seconds, THEN THE HeatSwitch SHALL keep all computed numbers on screen and SHALL display a default English sentence of at most 200 characters.
8. IF the Explanation_Service errors, THEN THE HeatSwitch SHALL keep all computed numbers on screen and SHALL display a default English sentence of at most 200 characters.
9. THE HeatSwitch SHALL display all numbers from the Calculation_Engine and SHALL NOT display numbers produced by the Explanation_Service.

### Requirement 10: Next step and equity-zone notice

**User Story:** As a user, I want a relevant next step based on my location, so that I know who to contact to move forward.

#### Acceptance Criteria

1. WHERE the entered zip is a Boston_Zip, THE HeatSwitch SHALL present a Boston Energy Saver consultation next step displaying the program name and a contact action.
2. WHERE the entered zip is not a Boston_Zip, THE HeatSwitch SHALL present a Mass Save Home Energy Assessment next step displaying the program name and a contact action.
3. WHERE the entered zip is an Equity_Zip, THE HeatSwitch SHALL display an informational enhanced-incentive notice that is visually distinguished from the rebate amount and does not include a modified rebate value.
4. THE HeatSwitch SHALL NOT change any rebate amount based on Equity_Zip status.
5. IF the zip field is empty or contains a value that is not exactly 5 numeric digits, THEN THE HeatSwitch SHALL suppress all location-based next steps and display an indication that a valid 5-digit zip is required.
6. IF the entered zip is a valid 5-digit value that matches no known Boston_Zip, Equity_Zip, or Massachusetts zip entry, THEN THE HeatSwitch SHALL present the Mass Save Home Energy Assessment next step as the default and indicate the location was not recognized.

### Requirement 11: Sourcing, transparency, and privacy

**User Story:** As a user, I want to see where every number comes from and to know my bill is not stored, so that I can trust the tool.

#### Acceptance Criteria

1. WHEN HeatSwitch displays a number derived from a calculation, a constant, or a bill field, THE HeatSwitch SHALL display beneath that number either a source link that opens the referenced source or a tooltip that reveals the source on hover or focus.
2. WHILE a number originates from an extracted bill field, THE HeatSwitch SHALL display beneath that number the exact bill text from which the value was extracted.
3. THE HeatSwitch SHALL provide a "How we calculate" section, collapsed by default, that when expanded displays the calculation formulas, the assumption values used, and the list of sources.
4. THE HeatSwitch SHALL hold uploaded bill contents only in volatile memory for the duration of the active session and SHALL NOT write uploaded bill contents to any persistent store or transmit them to any third-party endpoint.
5. THE HeatSwitch SHALL display the message "Your bill is never stored" in the footer.
6. THE Calculation_Engine SHALL define each source constant with an adjacent comment containing a resolvable source URL.

### Requirement 12: Visual and layout constraints

**User Story:** As a user, I want a clean, consistent interface, so that the result is easy to read and trust.

#### Acceptance Criteria

1. THE HeatSwitch SHALL build its interface using only shadcn/ui components and Tailwind utility classes, with zero custom CSS files other than the single Tailwind entry stylesheet and the scaffolded theme preset.
2. WHERE a component is required by the interface, THE HeatSwitch SHALL source it exclusively from the shadcn/ui component set (Card, Button, Slider, Switch, Tabs, Badge, Alert, Tooltip, Skeleton) and SHALL NOT introduce components from other UI libraries.
3. THE HeatSwitch SHALL use the Mist base color and Emerald theme with Emerald chart color, and SHALL render in light mode only such that no dark-mode class or theme toggle is present in the interface.
4. THE HeatSwitch SHALL render all text using the Inter font, with the verdict at `text-4xl font-semibold`, section titles at `text-lg font-medium`, and body text at `text-sm`.
5. THE HeatSwitch SHALL constrain the main layout container to `max-w-5xl mx-auto px-6 py-10`, style every card with `rounded-2xl border shadow-sm p-6`, and apply `gap-6` spacing between adjacent cards.
6. THE HeatSwitch SHALL render every displayed numeric value with the `tabular-nums` style.
7. THE HeatSwitch SHALL present exactly two tabs on a single page, labeled "My home" and "Buildings (landlords & city)".
8. WHEN the page loads, THE HeatSwitch SHALL display the "My home" tab as the active tab and SHALL hide the content of the "Buildings (landlords & city)" tab until that tab is selected.
9. WHILE the viewport width is below 768px, THE HeatSwitch SHALL stack all cards vertically in a single column rather than in the multi-column desktop layout.
