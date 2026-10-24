"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { UploadCard } from "@/components/my-home/upload-card"
import { VerdictCard } from "@/components/my-home/verdict-card"
import { CostChartCard } from "@/components/my-home/cost-chart-card"
import {
  YourNumbersCard,
  type EditableField,
  type FieldKey,
} from "@/components/my-home/your-numbers-card"
import {
  buildDemoScenario,
  getDemoExtraction,
  type DemoHome,
} from "@/components/my-home/demo-homes"

import { computeComparison, decideVerdict } from "@/lib/calc"
import { computeRebates } from "@/lib/rebates"
import {
  CONFIDENCE_THRESHOLD,
  type Assumptions,
  type ExtractionResult,
  type HeatingType,
  type HomeInputs,
  type Language,
} from "@/lib/schema"

/**
 * HeatSwitch single page (task 3.5 — demo flow wired in).
 *
 * Two tabs — "My home" (default) and "Buildings (landlords & city)". The My
 * home tab has two states:
 *
 *  - EMPTY (no demo/bill loaded): a hero headline + subhead + the UploadCard.
 *    None of the result cards render.
 *  - RESULTS (a demo clicked / a bill loaded): the VerdictCard is the full-width
 *    hero at the top, then CostChartCard, YourNumbersCard, and the still-
 *    placeholder cards (Assumptions/Rebates/NextStep/HowWeCalculate — task 4).
 *
 * All computed numbers come from the pure engine (lib/calc.ts, lib/rebates.ts);
 * the page only holds state and recomputes live on every confirm/edit/heating-
 * type/assumption change (Req 3.10). The verdict label flips from "Estimate" to
 * "Based on your bill" once nothing is amber (Req 3.8 / 3.9).
 */

/** The two editable extracted numbers tracked for confirmation. */
const EDITABLE_FIELD_KEYS: FieldKey[] = ["annualFuelUse", "fuelUnitPrice"]

/** Per-field display metadata, keyed by HeatingType, for YourNumbersCard. */
const FIELD_UNITS: Record<HeatingType, { fuelUse: string; price: string }> = {
  gas: { fuelUse: "therms", price: "$/therm" },
  oil: { fuelUse: "gallons", price: "$/gallon" },
  propane: { fuelUse: "gallons", price: "$/gallon" },
  "electric-resistance": { fuelUse: "kWh", price: "$/kWh" },
}

/** Placeholder card for the task-4 cards that still render in the results layout. */
function PlaceholderCard({
  title,
  note,
}: {
  title: string
  note: string
}) {
  return (
    <Card className="rounded-2xl p-6 shadow-sm">
      <CardHeader className="p-0">
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 text-sm text-muted-foreground">
        {note}
      </CardContent>
    </Card>
  )
}

export default function Page() {
  // --- Intake state shared with the UploadCard (empty state). ---
  const [zip, setZip] = React.useState("")
  const [heatIncludedInRent, setHeatIncludedInRent] = React.useState(false)

  // --- Loaded scenario state (null => empty state). ---
  // The validated extraction drives evidence + the amber/confirmed map; inputs
  // and assumptions drive the engine. They are seeded together by a demo click.
  const [extraction, setExtraction] = React.useState<ExtractionResult | null>(
    null
  )
  const [inputs, setInputs] = React.useState<HomeInputs | null>(null)
  const [assumptions, setAssumptions] = React.useState<Assumptions | null>(null)
  const [confirmed, setConfirmed] = React.useState<Record<FieldKey, boolean>>({
    annualFuelUse: true,
    fuelUnitPrice: true,
  })

  // --- Explanation language (explanation text itself arrives in task 7). ---
  const [language, setLanguage] = React.useState<Language>("en")

  const hasData = extraction !== null && inputs !== null && assumptions !== null

  /**
   * Load a demo home: route its cached fixture through the shared
   * `buildDemoScenario` helper (the SAME merge the demo-verdict test uses) so
   * the extraction goes through Zod, the inputs/assumptions are mapped exactly
   * once, and each field's `confirmed` starts from its extraction confidence —
   * low-confidence fields (< CONFIDENCE_THRESHOLD) start amber (Req 1.11, 2.8).
   */
  function handleTryDemo(demo: DemoHome) {
    const validatedExtraction = getDemoExtraction(demo)
    const { inputs: demoInputs, assumptions: demoAssumptions } =
      buildDemoScenario(demo)

    setExtraction(validatedExtraction)
    setInputs(demoInputs)
    setAssumptions(demoAssumptions)
    // Keep the intake fields in sync with the loaded demo.
    setZip(demoInputs.zip)
    setHeatIncludedInRent(demoInputs.heatIncludedInRent)

    // A field starts confirmed iff its confidence meets the threshold.
    setConfirmed({
      annualFuelUse:
        (validatedExtraction.annualFuelUse?.confidence ?? 1) >=
        CONFIDENCE_THRESHOLD,
      fuelUnitPrice:
        (validatedExtraction.fuelUnitPrice?.confidence ?? 1) >=
        CONFIDENCE_THRESHOLD,
    })
  }

  /** Real bill extraction is task 6; for now a dropped/selected file is a no-op
   *  (no AI call). The demo path is the one that fully works in task 3. */
  function handleBillSelected(_file: File) {
    // Intentionally left as a no-op until task 6 wires the Extraction_Service.
  }

  // --- Confirmation handlers (recompute happens via derived memo below). ---

  function handleFieldConfirm(key: FieldKey) {
    setConfirmed((prev) => ({ ...prev, [key]: true }))
  }

  function handleFieldEdit(key: FieldKey, value: number) {
    // Edit updates the value AND marks the field confirmed (Req 3.10).
    setInputs((prev) => (prev ? { ...prev, [key]: value } : prev))
    setConfirmed((prev) => ({ ...prev, [key]: true }))
  }

  function handleHeatingTypeChange(type: HeatingType) {
    setInputs((prev) => (prev ? { ...prev, heatingType: type } : prev))
  }

  // --- Live recompute: a pure function of inputs + assumptions (Req 3.10). ---
  const computed = React.useMemo(() => {
    if (!inputs || !assumptions) return null
    // HomeInputs always carries positive fuel use / price here (fixtures are
    // valid and ConfirmField only commits in-range numbers), so the engine's
    // preconditions hold. Guard defensively anyway.
    if (inputs.annualFuelUse <= 0 || inputs.fuelUnitPrice <= 0) return null

    const cmp = computeComparison(inputs, assumptions)
    const reb = computeRebates(inputs, assumptions)
    const verdict = decideVerdict(cmp, reb, inputs, new Date())
    return { cmp, reb, verdict }
  }, [inputs, assumptions])

  // N amber fields still needing a quick check. isEstimate while N >= 1.
  const isEstimate = EDITABLE_FIELD_KEYS.some((k) => !confirmed[k])

  // Build the EditableField[] for YourNumbersCard from the extraction + inputs.
  const editableFields: EditableField[] = React.useMemo(() => {
    if (!extraction || !inputs) return []
    const units = FIELD_UNITS[inputs.heatingType]
    return [
      {
        key: "annualFuelUse" as FieldKey,
        label: "Annual heating use",
        value: inputs.annualFuelUse,
        unit: units.fuelUse,
        evidence: extraction.annualFuelUse?.evidence,
        confirmed: confirmed.annualFuelUse,
      },
      {
        key: "fuelUnitPrice" as FieldKey,
        label: "Fuel price",
        value: inputs.fuelUnitPrice,
        unit: units.price,
        evidence: extraction.fuelUnitPrice?.evidence,
        confirmed: confirmed.fuelUnitPrice,
      },
    ]
  }, [extraction, inputs, confirmed])

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">HeatSwitch</h1>
          <p className="text-sm text-muted-foreground">Know before you switch</p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          Massachusetts
        </Badge>
      </header>

      <Tabs defaultValue="my-home">
        <TabsList className="mb-6">
          <TabsTrigger value="my-home">My home</TabsTrigger>
          <TabsTrigger value="buildings">
            Buildings (landlords &amp; city)
          </TabsTrigger>
        </TabsList>

        {/* TAB 1 — My home */}
        <TabsContent value="my-home" className="flex flex-col gap-6">
          {!hasData ? (
            // ---- EMPTY STATE: hero only. ----
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Should your Boston home switch to a heat pump?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Upload a bill or try a demo — we&apos;ll show the real numbers,
                  even when a heat pump isn&apos;t worth it yet.
                </p>
              </div>
              <UploadCard
                zip={zip}
                heatIncludedInRent={heatIncludedInRent}
                onZipChange={setZip}
                onRentToggle={setHeatIncludedInRent}
                onBillSelected={handleBillSelected}
                onTryDemo={handleTryDemo}
              />
            </div>
          ) : (
            // ---- RESULTS STATE: VerdictCard hero, then the rest. ----
            <>
              <VerdictCard
                verdict={computed!.verdict}
                annualDeltaDollars={computed!.cmp.annualDeltaDollars}
                explanation={null}
                language={language}
                isEstimate={isEstimate}
                onLanguageChange={setLanguage}
              />

              <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
                {/* Left column: cost chart. */}
                <div className="flex flex-col gap-6 md:col-span-3">
                  <CostChartCard
                    currentAnnualCost={computed!.cmp.currentAnnualCost}
                    heatPumpAnnualCost={computed!.cmp.heatPumpAnnualCost}
                    breakevenCOP={computed!.cmp.breakevenCOP}
                  />
                </div>

                {/* Right column: your numbers + task-4 placeholders. */}
                <div className="flex flex-col gap-6 md:col-span-2">
                  <Card className="rounded-2xl p-6 shadow-sm">
                    <YourNumbersCard
                      fields={editableFields}
                      heatingType={inputs!.heatingType}
                      onFieldConfirm={handleFieldConfirm}
                      onFieldEdit={handleFieldEdit}
                      onHeatingTypeChange={handleHeatingTypeChange}
                    />
                  </Card>
                  <PlaceholderCard
                    title="Assumptions"
                    note="Sliders for COP, electricity price, fuel price, and the seasonal heat pump rate switch. (Task 4.1)"
                  />
                  <PlaceholderCard
                    title="Rebates"
                    note="Mass Save rebate, net install cost, payback, requirements, and the renter/landlord path. (Task 4.2)"
                  />
                </div>
              </div>

              <PlaceholderCard
                title="Next step"
                note="Free Boston Energy Saver consultation (Boston zips) or Mass Save Home Energy Assessment elsewhere. (Task 4.3)"
              />
              <PlaceholderCard
                title="How we calculate"
                note="Formulas, assumptions, and sources — collapsed by default. (Task 4.4)"
              />
            </>
          )}
        </TabsContent>

        {/* TAB 2 — Buildings (landlords & city) */}
        <TabsContent value="buildings" className="flex flex-col gap-6">
          <PlaceholderCard
            title="Buildings (landlords &amp; city)"
            note="Zip picker and a ranked table of Boston multifamily buildings by heat pump opportunity, from the City of Boston BERDO 2021 dataset. (Task 5.2)"
          />
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <footer className="mt-10 border-t pt-6 text-sm text-muted-foreground">
        Your bill is never stored.
      </footer>
    </div>
  )
}
