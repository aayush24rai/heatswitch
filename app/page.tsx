"use client"

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { BuildingsTable } from "@/components/buildings/buildings-table"

import { FadeIn } from "@/components/shared/fade-in"
import { AnimatedHeading } from "@/components/shared/animated-heading"

import { UploadCard } from "@/components/my-home/upload-card"
import { VerdictCard } from "@/components/my-home/verdict-card"
import { CostChartCard } from "@/components/my-home/cost-chart-card"
import {
  YourNumbersCard,
  type EditableField,
  type FieldKey,
} from "@/components/my-home/your-numbers-card"
import { AssumptionsCard } from "@/components/my-home/assumptions-card"
import { RebatesCard } from "@/components/my-home/rebates-card"
import { NextStepRow } from "@/components/my-home/next-step-row"
import { HowWeCalculate } from "@/components/my-home/how-we-calculate"
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
  type BerdoBuilding,
  type ExtractionResult,
  type HeatingType,
  type HomeInputs,
  type Language,
} from "@/lib/schema"

// Cleaned BERDO 2021 dataset, loaded client-side via a static JSON import
// (Req 8.1). `resolveJsonModule` is enabled in tsconfig.json, so this is
// SSR-safe and bundled at build time — no runtime fetch or useEffect needed.
import buildingsData from "@/data/berdo-2021/buildings.json"

/** The imported dataset, treated as BerdoBuilding[] after a runtime shape guard. */
const BUILDINGS = buildingsData as BerdoBuilding[]

/**
 * HeatSwitch single page.
 *
 * ONE layout for both tabs:
 *   1. VIDEO HERO (presentation only) — a full-bleed background <video> (with a
 *      poster="/hero.jpg" fallback), a bottom legibility gradient, a glass
 *      navbar, an animated heading, FadeIn-staged subhead/buttons, and a
 *      right-column glass tag. It always renders at the top of the page,
 *      regardless of the active tab. Under prefers-reduced-motion the video does
 *      not autoplay — the static poster is shown instead (SSR-safe).
 *   2. TABS BAR (id="tabs") — directly below the hero; "My home" / "Buildings".
 *   3. TAB CONTENT —
 *        My home: the #try-it intake (UploadCard) then the results below it.
 *        Buildings: the ranked BERDO table (light layout, no separate header).
 *
 * The hero's glass navbar is the only header; there is no separate light header.
 *
 * All computed numbers come from the pure engine (lib/calc.ts, lib/rebates.ts);
 * the page only holds state and recomputes live on every confirm/edit/heating-
 * type/assumption change (Req 3.10). The verdict label reads "Demo home" for
 * demo inputs, else flips from "Estimate" to "Based on your bill" (Req 3.8/3.9).
 */

/** The background video for the hero (external, intentionally not self-hosted). */
const HERO_VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4"

/** The two editable extracted numbers tracked for confirmation. */
const EDITABLE_FIELD_KEYS: FieldKey[] = ["annualFuelUse", "fuelUnitPrice"]

/** Per-field display metadata, keyed by HeatingType, for YourNumbersCard. */
const FIELD_UNITS: Record<HeatingType, { fuelUse: string; price: string }> = {
  gas: { fuelUse: "therms", price: "$/therm" },
  oil: { fuelUse: "gallons", price: "$/gallon" },
  propane: { fuelUse: "gallons", price: "$/gallon" },
  "electric-resistance": { fuelUse: "kWh", price: "$/kWh" },
}

export default function Page() {
  // --- Which tab is active (lifted from Tabs so the hero navbar can switch). ---
  const [activeTab, setActiveTab] = React.useState("my-home")

  // --- Intake state shared with the #try-it UploadCard. ---
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
  // True when the loaded scenario came from a demo home (vs a real uploaded bill).
  const [isDemo, setIsDemo] = React.useState(false)

  // --- Explanation language (explanation text itself arrives in task 7). ---
  const [language, setLanguage] = React.useState<Language>("en")

  // --- Buildings tab: selected zip (null => all of Boston). ---
  const [buildingsSelectedZip, setBuildingsSelectedZip] = React.useState<
    string | null
  >(null)

  // The dataset genuinely loaded iff the static import yielded a non-empty
  // array. With the JSON import this is always true; the guard exists so a
  // malformed/empty dataset shows the Alert (Req 8.2) rather than a blank table.
  const buildingsLoaded = Array.isArray(BUILDINGS) && BUILDINGS.length > 0

  // --- Refs for smooth-scrolling to sections. ---
  const tabsRef = React.useRef<HTMLDivElement>(null)
  const tryItRef = React.useRef<HTMLElement>(null)
  const resultsRef = React.useRef<HTMLDivElement>(null)
  const howWeCalculateRef = React.useRef<HTMLDivElement>(null)
  const footerRef = React.useRef<HTMLElement>(null)

  const hasData = extraction !== null && inputs !== null && assumptions !== null

  // --- Reduced-motion-aware video autoplay (SSR-safe: static on first render,
  //     enhance to autoplay on mount only when motion is allowed). ---
  const [heroAutoplay, setHeroAutoplay] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setHeroAutoplay(!mq.matches)
    const onChange = (e: MediaQueryListEvent) => setHeroAutoplay(!e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  // Small reduced-motion check reused by the smooth-scroll + nav handlers.
  function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }

  function smoothScrollTo(el: HTMLElement | null) {
    if (!el) return
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    })
  }

  // --- Hero navbar / button handlers. ---
  // "Buildings": switch to the Buildings tab and scroll to the tabs bar.
  function goToBuildings() {
    setActiveTab("buildings")
    requestAnimationFrame(() => smoothScrollTo(tabsRef.current))
  }
  // "Try a demo" / hero buttons: switch to My home and scroll to the intake.
  function goToTryIt() {
    setActiveTab("my-home")
    requestAnimationFrame(() => smoothScrollTo(tryItRef.current))
  }
  // "How it works": My home, scroll to the How-we-calculate section.
  function goToHowItWorks() {
    setActiveTab("my-home")
    requestAnimationFrame(() => smoothScrollTo(howWeCalculateRef.current))
  }
  // "Sources": My home, scroll to the footer/sources.
  function goToSources() {
    setActiveTab("my-home")
    requestAnimationFrame(() => smoothScrollTo(footerRef.current))
  }

  // When a demo/bill loads (hasData flips true), smooth-scroll to the results.
  React.useEffect(() => {
    if (hasData) {
      const id = window.requestAnimationFrame(() =>
        smoothScrollTo(resultsRef.current)
      )
      return () => window.cancelAnimationFrame(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData])

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
    setIsDemo(true)
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
   *  (no AI call). The demo path is the one that fully works today. */
  function handleBillSelected(_file: File) {
    // Intentionally left as a no-op until task 6 wires the Extraction_Service.
    // A real bill is NOT a demo.
    setIsDemo(false)
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

  // --- Rent toggle: keep the intake state AND loaded inputs in sync so the
  //     landlord path + verdict.isRenter follow it live (Req 7.1/7.2/7.3). ---
  function handleRentToggle(on: boolean) {
    setHeatIncludedInRent(on)
    setInputs((prev) => (prev ? { ...prev, heatIncludedInRent: on } : prev))
  }

  // --- Assumptions handlers (merge so the computed useMemo re-runs; Req 4.11). ---
  function handleCOPChange(cop: number) {
    setAssumptions((prev) => (prev ? { ...prev, heatPumpCOP: cop } : prev))
  }

  function handleElectricityPriceChange(price: number) {
    setAssumptions((prev) =>
      prev ? { ...prev, electricityPrice: price } : prev
    )
  }

  function handleSeasonalRateToggle(on: boolean) {
    setAssumptions((prev) =>
      prev ? { ...prev, seasonalHeatPumpRate: on } : prev
    )
  }

  // Fuel price lives on HomeInputs (not Assumptions); confirming it too keeps
  // the "Your numbers" card consistent with the slider.
  function handleFuelPriceChange(price: number) {
    setInputs((prev) => (prev ? { ...prev, fuelUnitPrice: price } : prev))
    setConfirmed((prev) => ({ ...prev, fuelUnitPrice: true }))
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
    <div>
      {/* ================= VIDEO HERO (always at the top) ================= */}
      <section className="relative flex min-h-svh w-full flex-col overflow-hidden text-white">
        {/* Background: autoplay video when motion is allowed, else static poster. */}
        {heroAutoplay ? (
          <video
            key="hero-video"
            autoPlay
            loop
            muted
            playsInline
            poster="/hero.jpg"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          >
            <source src={HERO_VIDEO_SRC} type="video/mp4" />
          </video>
        ) : (
          // Reduced motion (or pre-mount SSR default): static poster image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/hero.jpg"
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
        )}

        {/* Bottom-only legibility gradient. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black/50 to-transparent" />

        {/* Glass navbar. */}
        <div className="absolute inset-x-0 top-0 z-20 px-6 pt-6 md:px-12 lg:px-16">
          <nav className="liquid-glass flex items-center justify-between rounded-xl px-4 py-2 text-white">
            <span className="text-2xl font-semibold tracking-tight">
              HeatSwitch
            </span>
            <div className="hidden gap-8 text-sm md:flex">
              <button
                type="button"
                className="transition-colors hover:text-gray-300"
                onClick={goToHowItWorks}
              >
                How it works
              </button>
              <button
                type="button"
                className="transition-colors hover:text-gray-300"
                onClick={goToBuildings}
              >
                Buildings
              </button>
              <button
                type="button"
                className="transition-colors hover:text-gray-300"
                onClick={goToSources}
              >
                Sources
              </button>
            </div>
            <button
              type="button"
              className="rounded-lg bg-white px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-100"
              onClick={goToTryIt}
            >
              Try a demo
            </button>
          </nav>
        </div>

        {/* Bottom-pinned hero content. */}
        <div className="flex flex-1 flex-col justify-end px-6 pb-12 md:px-12 lg:grid lg:grid-cols-2 lg:items-end lg:px-16 lg:pb-16">
          {/* Left column. */}
          <div className="max-w-full">
            <h1
              className="mb-4 text-4xl font-normal leading-[1.05] md:text-5xl lg:text-6xl xl:text-7xl"
              style={{ letterSpacing: "-0.04em" }}
            >
              <AnimatedHeading
                text={"Should your Boston home\nswitch to a heat pump?"}
                className="text-white"
              />
            </h1>

            <FadeIn delay={800} duration={1000}>
              <p className="mb-5 text-base text-white/85 md:text-lg">
                Upload a bill. Get an honest answer, with the source under
                every number.
              </p>
            </FadeIn>

            <FadeIn delay={1200}>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  className="rounded-lg !bg-white px-8 py-3 font-medium !text-black transition-colors hover:!bg-gray-100"
                  onClick={goToTryIt}
                >
                  Upload your bill
                </button>
                <button
                  type="button"
                  className="liquid-glass rounded-lg border border-white/20 px-8 py-3 font-medium text-white transition-colors hover:bg-white hover:text-black"
                  onClick={goToTryIt}
                >
                  Try a demo home
                </button>
              </div>
            </FadeIn>
          </div>

          {/* Right column tag. */}
          <div className="mt-8 flex items-end lg:mt-0 lg:justify-end">
            <FadeIn delay={1400}>
              <div className="liquid-glass rounded-xl border border-white/20 px-6 py-3 text-lg font-light text-white md:text-xl lg:text-2xl">
                Renters. Homeowners. Buildings.
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ================= TABS BAR (directly below the hero) ================= */}
      <div ref={tabsRef} id="tabs" className="mx-auto max-w-5xl px-6 pt-10">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-home">My home</TabsTrigger>
            <TabsTrigger value="buildings">
              Buildings (landlords &amp; city)
            </TabsTrigger>
          </TabsList>

          {/* TAB 1 — My home: #try-it intake, then results below it. */}
          <TabsContent value="my-home" className="flex flex-col gap-6">
            <section ref={tryItRef} id="try-it" className="py-6">
              <h2 className="mb-6 text-lg font-medium">Try it</h2>
              <UploadCard
                zip={zip}
                heatIncludedInRent={heatIncludedInRent}
                onZipChange={setZip}
                onRentToggle={handleRentToggle}
                onBillSelected={handleBillSelected}
                onTryDemo={handleTryDemo}
              />
            </section>

            {hasData ? (
              <div ref={resultsRef} className="flex flex-col gap-6 pb-6">
                <VerdictCard
                  verdict={computed!.verdict}
                  annualDeltaDollars={computed!.cmp.annualDeltaDollars}
                  explanation={null}
                  language={language}
                  isEstimate={isEstimate}
                  isDemo={isDemo}
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
                    <AssumptionsCard
                      assumptions={assumptions!}
                      fuelUnitPrice={inputs!.fuelUnitPrice}
                      heatingType={inputs!.heatingType}
                      onChangeCOP={handleCOPChange}
                      onChangeElectricityPrice={handleElectricityPriceChange}
                      onChangeFuelPrice={handleFuelPriceChange}
                      onToggleSeasonalRate={handleSeasonalRateToggle}
                    />
                    <RebatesCard result={computed!.reb} inputs={inputs!} />
                  </div>
                </div>

                <NextStepRow zip={inputs!.zip} />
                <div ref={howWeCalculateRef}>
                  <HowWeCalculate assumptions={assumptions!} />
                </div>
              </div>
            ) : null}
          </TabsContent>

          {/* TAB 2 — Buildings (landlords & city). */}
          <TabsContent value="buildings" className="flex flex-col gap-6 py-6">
            {buildingsLoaded ? (
              <BuildingsTable
                buildings={BUILDINGS}
                selectedZip={buildingsSelectedZip}
                onZipChange={setBuildingsSelectedZip}
              />
            ) : (
              // Dataset genuinely failed to load / is empty (Req 8.2).
              <Alert variant="destructive">
                <AlertTitle>Building data is unavailable right now.</AlertTitle>
                <AlertDescription>
                  We couldn&apos;t load the Boston buildings dataset. Please try
                  again later.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer
        ref={footerRef}
        className="mx-auto mt-10 max-w-5xl border-t px-6 pt-6 pb-10 text-sm text-muted-foreground"
      >
        Your bill is never stored
      </footer>
    </div>
  )
}
