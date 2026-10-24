"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
 * HeatSwitch single page (tasks 3.5 + 8 video-hero rework).
 *
 * Two tabs — "My home" (default) and "Buildings (landlords & city)".
 *
 * MY HOME is ONE scrollable page, top to bottom:
 *
 *   1. VIDEO HERO (presentation only) — a full-bleed background <video> (with a
 *      poster="/hero.jpg" fallback), a bottom legibility gradient, a glass
 *      navbar, an animated heading, FadeIn-staged subhead/buttons, and a
 *      right-column glass tag. The hero contains NO intake controls: the two
 *      hero buttons and the navbar "Try a demo" only smooth-scroll to #try-it.
 *      Under prefers-reduced-motion the video does not autoplay — the static
 *      poster is shown instead (SSR-safe: static on first render, enhanced to
 *      autoplay on mount when motion is allowed).
 *   2. #try-it — the light Mist section holding the real <UploadCard/> (drop
 *      zone + zip + rent toggle + the three demo buttons). ALL intake lives
 *      here, out of the hero.
 *   3. RESULTS — rendered below #try-it once a demo/bill is loaded (hasData);
 *      loading one smooth-scrolls here (instant under reduced motion).
 *
 * Because the hero's glass navbar is the header for My home, the plain light
 * header is NOT rendered on My home (avoids two headers). The Tabs control is
 * rendered below the hero; tab switching also routes through the hero navbar's
 * "Buildings" link. The BUILDINGS tab keeps the existing light layout with the
 * normal light header + tabs and no hero.
 *
 * All computed numbers come from the pure engine (lib/calc.ts, lib/rebates.ts);
 * the page only holds state and recomputes live on every confirm/edit/heating-
 * type/assumption change (Req 3.10). The verdict label flips from "Estimate" to
 * "Based on your bill" once nothing is amber (Req 3.8 / 3.9).
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

/** Placeholder card for the task-4 cards that still render in the results layout. */
function PlaceholderCard({ title, note }: { title: string; note: string }) {
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

  // --- Explanation language (explanation text itself arrives in task 7). ---
  const [language, setLanguage] = React.useState<Language>("en")

  // --- Refs for smooth-scrolling to sections. ---
  const tryItRef = React.useRef<HTMLElement>(null)
  const resultsRef = React.useRef<HTMLDivElement>(null)
  const howWeCalculateRef = React.useRef<HTMLDivElement>(null)
  const footerRef = React.useRef<HTMLElement>(null)

  const hasData = extraction !== null && inputs !== null && assumptions !== null

  // --- Reduced-motion-aware video autoplay (SSR-safe: static on first render,
  //     enhance to autoplay on mount only when motion is allowed). Mirrors the
  //     matchMedia pattern used by fade-in.tsx. ---
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

  // When a demo/bill loads (hasData flips true), the results section mounts
  // below #try-it; smooth-scroll to it (instant under reduced motion). Keyed on
  // hasData so it fires on the flip.
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

  // The shared #try-it intake section (same UploadCard on both tabs' flows).
  const tryItSection = (
    <section ref={tryItRef} id="try-it" className="mx-auto max-w-5xl px-6 py-16">
      <h2 className="mb-6 text-lg font-medium">Try it</h2>
      <UploadCard
        zip={zip}
        heatIncludedInRent={heatIncludedInRent}
        onZipChange={setZip}
        onRentToggle={setHeatIncludedInRent}
        onBillSelected={handleBillSelected}
        onTryDemo={handleTryDemo}
      />
    </section>
  )

  // The results section (rendered below #try-it once a demo/bill is loaded).
  const resultsSection = hasData ? (
    <section className="mx-auto max-w-5xl px-6 pb-16">
      <div ref={resultsRef} className="flex flex-col gap-6">
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
        <div ref={howWeCalculateRef}>
          <PlaceholderCard
            title="How we calculate"
            note="Formulas, assumptions, and sources — collapsed by default. (Task 4.4)"
          />
        </div>
      </div>
    </section>
  ) : null

  const footer = (
    <footer
      ref={footerRef}
      className="mx-auto mt-10 max-w-5xl border-t px-6 pt-6 pb-10 text-sm text-muted-foreground"
    >
      Your bill is never stored · Photo: [credit]
    </footer>
  )

  // =========================================================================
  // MY HOME — video hero (top) → #try-it → results. The hero's glass navbar is
  // the header; the Tabs control sits below the hero. No plain light header.
  // =========================================================================
  if (activeTab === "my-home") {
    return (
      <div>
        {/* VIDEO HERO (presentation only — no intake controls). */}
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
                  onClick={() => smoothScrollTo(howWeCalculateRef.current)}
                >
                  How it works
                </button>
                <button
                  type="button"
                  className="transition-colors hover:text-gray-300"
                  onClick={() => setActiveTab("buildings")}
                >
                  Buildings
                </button>
                <button
                  type="button"
                  className="transition-colors hover:text-gray-300"
                  onClick={() => smoothScrollTo(footerRef.current)}
                >
                  Sources
                </button>
              </div>
              <button
                type="button"
                className="rounded-lg bg-white px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-100"
                onClick={() => smoothScrollTo(tryItRef.current)}
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
                <p className="mb-5 text-base text-gray-300 md:text-lg">
                  Upload a bill. Get an honest answer, with the source under
                  every number.
                </p>
              </FadeIn>

              <FadeIn delay={1200}>
                <div className="flex flex-wrap gap-4">
                  <button
                    type="button"
                    className="rounded-lg bg-white px-8 py-3 font-medium text-black transition-colors hover:bg-gray-100"
                    onClick={() => smoothScrollTo(tryItRef.current)}
                  >
                    Upload your bill
                  </button>
                  <button
                    type="button"
                    className="liquid-glass rounded-lg border border-white/20 px-8 py-3 font-medium text-white transition-colors hover:bg-white hover:text-black"
                    onClick={() => smoothScrollTo(tryItRef.current)}
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

        {/* Tabs control below the hero (navigation lives in the glass navbar
            too; this keeps the Tabs controlled + lets users switch here). */}
        <div className="mx-auto max-w-5xl px-6 pt-10">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="my-home">My home</TabsTrigger>
              <TabsTrigger value="buildings">
                Buildings (landlords &amp; city)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* #try-it intake, then results below it. */}
        {tryItSection}
        {resultsSection}
        {footer}
      </div>
    )
  }

  // =========================================================================
  // BUILDINGS — existing light layout, with the normal light header + tabs and
  // no hero. Unchanged.
  // =========================================================================
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="my-home">My home</TabsTrigger>
          <TabsTrigger value="buildings">
            Buildings (landlords &amp; city)
          </TabsTrigger>
        </TabsList>

        {/* TAB 2 — Buildings (landlords & city) */}
        <TabsContent value="buildings" className="flex flex-col gap-6">
          <PlaceholderCard
            title="Buildings (landlords &amp; city)"
            note="Zip picker and a ranked table of Boston multifamily buildings by heat pump opportunity, from the City of Boston BERDO 2021 dataset. (Task 5.2)"
          />
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <footer
        ref={footerRef}
        className="mt-10 border-t pt-6 text-sm text-muted-foreground"
      >
        Your bill is never stored · Photo: [credit]
      </footer>
    </div>
  )
}
