"use client"

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { BuildingsTable } from "@/components/buildings/buildings-table"

import { FadeIn } from "@/components/shared/fade-in"
import { AnimatedHeading } from "@/components/shared/animated-heading"
import { SourceLink } from "@/components/shared/source-link"

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
import { LandlordBox } from "@/components/my-home/landlord-box"
import { NextStepRow } from "@/components/my-home/next-step-row"
import { HowWeCalculate } from "@/components/my-home/how-we-calculate"
import {
  buildDemoScenario,
  getDemoExtraction,
  type DemoHome,
} from "@/components/my-home/demo-homes"
import { extractFromFile } from "@/components/my-home/bill-upload"
import { requestExplanation } from "@/components/my-home/explain-request"
import { DEFAULT_EXPLANATION } from "@/components/my-home/verdict-card"
import {
  defaultAssumptions,
  mapExtractionToScenario,
} from "@/components/my-home/extraction-map"

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
import { fieldRange, resetInputsForHeatingType } from "@/lib/field-ranges"

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
 *   1. PHOTO HERO (presentation only) — a full-bleed next/image background
 *      (/hero.jpg) with a slow 20s ken-burns scale (the sanctioned
 *      `.hero-kenburns` utility; design.md line 22), a bottom legibility
 *      gradient, a glass navbar, an animated heading, FadeIn-staged
 *      subhead/buttons, and a right-column glass tag. It always renders at the
 *      top of the page, regardless of the active tab. Under
 *      prefers-reduced-motion the scale animation does not run (static image,
 *      handled in CSS — SSR-safe, no client branching).
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

  // --- Upload/extraction status (real bill path, task 6.2). ---
  const [isExtracting, setIsExtracting] = React.useState(false)
  // A user-facing message shown above the results when extraction did not fully
  // succeed and we fell back to the manual (pre-filled, amber) form.
  const [extractionNotice, setExtractionNotice] = React.useState<string | null>(
    null
  )
  // A monotonically increasing signal the page bumps to ask UploadCard to open
  // the manual form (e.g. after a Step-2 "Change" clears the units). The paired
  // seed type preselects the manual heating type. Never seeds zero inputs.
  const [openManualSignal, setOpenManualSignal] = React.useState(0)
  const [manualSeedType, setManualSeedType] = React.useState<HeatingType | null>(
    null
  )

  // --- Explanation language + the fetched prose / loading flag (task 7.2). ---
  const [language, setLanguage] = React.useState<Language>("en")
  // The explanation prose for the CURRENT language, or null while loading /
  // before the first request. Numbers on screen NEVER come from here (Req 9.9).
  const [explanation, setExplanation] = React.useState<string | null>(null)
  const [explanationLoading, setExplanationLoading] = React.useState(false)

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
  const howItWorksRef = React.useRef<HTMLElement>(null)
  const resultsRef = React.useRef<HTMLDivElement>(null)
  const howWeCalculateRef = React.useRef<HTMLDivElement>(null)
  const footerRef = React.useRef<HTMLElement>(null)

  const hasData = extraction !== null && inputs !== null && assumptions !== null

  // --- Reduced-motion-aware video autoplay. SSR renders the static poster
  //     (heroAutoplay=false); on mount we enable autoplay only when motion is
  //     allowed, and react to changes in the media query. ---
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
  // "How it works": My home, scroll to the always-visible How-it-works section
  // (which exists before any demo/bill is loaded — not the results-only
  // How-we-calculate section).
  function goToHowItWorks() {
    setActiveTab("my-home")
    requestAnimationFrame(() => smoothScrollTo(howItWorksRef.current))
  }
  // "Sources": scroll to the footer, which always lists the Sources.
  function goToSources() {
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
    setExtractionNotice(null)
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

  /**
   * Real bill extraction (task 6.2): resize/validate the file on the client,
   * POST it to `/api/extract`, and map the validated result to inputs + the
   * confirmed map. On any failure (bad/HEIC/oversized file, >30s timeout, server
   * error, or an all-low-confidence result) fall back to the MANUAL form:
   * pre-fill whatever we know (heating type + any extracted numbers, else safe
   * defaults), mark the numeric fields amber, and show an "extraction
   * unsuccessful" notice. A real bill is never a demo.
   */
  async function handleBillSelected(file: File) {
    setIsDemo(false)
    setExtractionNotice(null)
    setIsExtracting(true)

    const utility = "eversource" as const
    const householdSize = 1
    const intake = { zip, utility, heatIncludedInRent, householdSize }

    try {
      const outcome = await extractFromFile(file)

      if (outcome.ok) {
        const mapped = mapExtractionToScenario(outcome.result, intake)
        setExtraction(outcome.result)
        setInputs(mapped.inputs)
        setAssumptions(mapped.assumptions)
        setConfirmed(mapped.confirmed)
        // Even on a valid parse, an all-low-confidence read is treated as a
        // soft failure: keep the pre-filled fields but prompt a manual check.
        setExtractionNotice(
          mapped.allLowConfidence
            ? "We couldn't read your bill confidently. Check the numbers below."
            : null
        )
        return
      }

      // Hard failure → manual form, pre-filled with safe defaults, all amber.
      const messageByReason: Record<typeof outcome.reason, string> = {
        heic: "That looks like a HEIC photo. Export as JPEG and try again — or enter your numbers below.",
        unsupported:
          "That file type isn't supported. Upload a JPEG, PNG, or PDF — or enter your numbers below.",
        "too-large":
          "That file is too large (keep it under 4 MB). Enter your numbers below.",
        timeout:
          "Reading your bill took too long. Enter your numbers below.",
        failed:
          "We couldn't read your bill. Enter your numbers below.",
      }
      seedManualForm(intake)
      setExtractionNotice(messageByReason[outcome.reason])
    } finally {
      setIsExtracting(false)
    }
  }

  /**
   * Seed the manual (pre-filled) form used as the extraction fallback. Defaults
   * to gas heat with plausible placeholder numbers, both marked amber so the
   * user confirms/edits them in place (the oil manual inputs — gallons + price —
   * are reachable via the heating-type chip "Change" + ConfirmField's in-range
   * edit validation). Known intake fields (zip, rent flag) are carried over.
   */
  function seedManualForm(intake: {
    zip: string
    utility: "eversource" | "national-grid" | "unitil"
    heatIncludedInRent: boolean
    householdSize: number
  }) {
    const manualExtraction: ExtractionResult = {
      heatingType: {
        value: "gas",
        confidence: 1,
        evidence: "Entered manually",
      },
      annualFuelUse: {
        value: 650,
        confidence: 0, // amber — needs a manual check
        evidence: "Enter your annual heating use",
      },
      fuelUnitPrice: {
        value: 2.4,
        confidence: 0, // amber — needs a manual check
        evidence: "Enter your fuel price",
      },
    }
    setExtraction(manualExtraction)
    setInputs({
      heatingType: "gas",
      annualFuelUse: 650,
      fuelUnitPrice: 2.4,
      zip: intake.zip,
      utility: intake.utility,
      heatIncludedInRent: intake.heatIncludedInRent,
      householdSize: intake.householdSize,
    })
    setAssumptions(defaultAssumptions(intake.utility))
    setConfirmed({ annualFuelUse: false, fuelUnitPrice: false })
  }

  /**
   * Manual entry (item 5): the user typed a heating type + yearly use + price.
   * Seed a confirmed scenario that feeds the SAME results flow as a bill. Not a
   * demo; both numbers are user-provided and confirmed.
   */
  function handleManualSubmit(
    heatingType: HeatingType,
    annualFuelUse: number,
    fuelUnitPrice: number
  ) {
    setIsDemo(false)
    setExtractionNotice(null)
    const utility = "eversource" as const
    setExtraction({
      heatingType: { value: heatingType, confidence: 1, evidence: "Entered manually" },
      annualFuelUse: { value: annualFuelUse, confidence: 1, evidence: "Entered manually" },
      fuelUnitPrice: { value: fuelUnitPrice, confidence: 1, evidence: "Entered manually" },
    })
    setInputs({
      heatingType,
      annualFuelUse,
      fuelUnitPrice,
      zip,
      utility,
      heatIncludedInRent,
      householdSize: 1,
    })
    setAssumptions(defaultAssumptions(utility))
    setConfirmed({ annualFuelUse: true, fuelUnitPrice: true })
  }

  /**
   * Guesser result (item 1): the three-question helper resolved a heating type
   * (null = mini-split). We do NOT seed any inputs here — seeding 0/0 would make
   * the zero-value results/Step 2 flash (which we forbid). Instead the manual
   * form (in UploadCard) opens with the guessed type preselected and the
   * yearly-use field focused, so results only appear once the user enters a
   * positive use + price. Here we only honor the rent answer.
   */
  function handleGuessResolved(
    _heatingType: HeatingType | null,
    rentIncluded: boolean
  ) {
    void _heatingType
    if (rentIncluded) handleRentToggle(true)
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

  // Changing heating type CLEARS the old usage/price — they were in the old
  // fuel's units, so reinterpreting them in the new unit would be wrong
  // (item 6). resetInputsForHeatingType zeroes both; the computed memo skips
  // recompute while either is <= 0, and both fields are marked unconfirmed so
  // the empty inputs show for re-entry in the new fuel's units.
  function handleHeatingTypeChange(type: HeatingType) {
    // Clear the loaded scenario entirely — old usage/price were in the old
    // fuel's units, so we never reinterpret them, and we never show a zero
    // Step 2. Reopen the manual form preselected to the new type so the user
    // re-enters use + price; results reappear only once both are > 0.
    setExtraction(null)
    setInputs(null)
    setAssumptions(null)
    setConfirmed({ annualFuelUse: false, fuelUnitPrice: false })
    setManualSeedType(type)
    setOpenManualSignal((n) => n + 1)
  }

  // --- Rent toggle: keep the intake state AND loaded inputs in sync so the
  //     landlord path + verdict.isRenter follow it live (Req 7.1/7.2/7.3). ---
  function handleRentToggle(on: boolean) {
    setHeatIncludedInRent(on)
    setInputs((prev) => (prev ? { ...prev, heatIncludedInRent: on } : prev))
  }

  // --- Zip: keep the intake state AND any loaded inputs in sync so NextStepRow
  //     (Boston / equity notice) re-renders live while results are shown. The
  //     equity notice only appears for the nine equity zips (demos use 02118,
  //     which is Boston but NOT equity), so editing the zip to e.g. 02125
  //     surfaces it immediately. ---
  function handleZipChange(nextZip: string) {
    setZip(nextZip)
    setInputs((prev) => (prev ? { ...prev, zip: nextZip } : prev))
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

  // --- Rebate intake: household size + income feed selectRebateTier live. ---
  // Household size stays an integer 1–8; blank income deletes the key so the
  // tier falls back to Standard (annualIncome: undefined), never 0.
  function handleHouseholdSizeChange(size: number) {
    const n = Math.min(8, Math.max(1, Math.round(size)))
    setInputs((prev) => (prev ? { ...prev, householdSize: n } : prev))
  }

  function handleIncomeChange(income: number | undefined) {
    setInputs((prev) => {
      if (!prev) return prev
      if (income === undefined) {
        // Delete the key rather than set 0, so the tier is Standard.
        const { annualIncome: _omit, ...rest } = prev
        void _omit
        return rest
      }
      return { ...prev, annualIncome: income }
    })
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

  // --- Explanation request (task 7.2, Req 9.1/9.4/9.5/9.6/9.7/9.8/9.9). ---
  // When results exist, request an explanation in the current language from
  // /api/explain, sending ONLY the computed numbers (no raw bill content). On a
  // language change the effect re-runs: it shows a Skeleton while loading and
  // keeps the numbers visible throughout. A per-request AbortController + a
  // language guard discard any stale response whose language no longer matches
  // the selected one. On timeout/error it falls back to the default English
  // sentence (<=200 chars). The numbers rendered always come from the engine.
  React.useEffect(() => {
    if (!computed) {
      setExplanation(null)
      setExplanationLoading(false)
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setExplanationLoading(true)
    setExplanation(null)

    // Format every figure exactly as the UI renders it so the model echoes the
    // same on-screen text (the LLM still computes nothing). Mirrors
    // VerdictCard.formatDollars and its payback phrasing.
    const formatDollars = (value: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Math.abs(Math.round(value)))
    const payback = computed.reb.paybackYears
    const paybackText =
      payback === null
        ? "no payback (costs more to run)"
        : payback >= 1
          ? `${payback.toFixed(1)} years`
          : `${Math.round(payback * 12)} months`

    const payload = {
      verdict: computed.verdict,
      numbers: {
        annualDeltaDollars: formatDollars(computed.cmp.annualDeltaDollars),
        currentAnnualCost: formatDollars(computed.cmp.currentAnnualCost),
        heatPumpAnnualCost: formatDollars(computed.cmp.heatPumpAnnualCost),
        breakevenCOP: computed.cmp.breakevenCOP.toFixed(2),
        rebateAmount: formatDollars(computed.reb.rebateAmount),
        netInstallCost: formatDollars(computed.reb.netInstallCost),
        paybackYears: paybackText,
      },
      language,
    }
    const requestedLanguage = language

    requestExplanation(payload, controller.signal).then((outcome) => {
      // Ignore a stale response: the effect was cleaned up, or the selected
      // language changed since this request went out.
      if (cancelled || requestedLanguage !== language) return
      setExplanation(outcome.ok ? outcome.explanation : DEFAULT_EXPLANATION)
      setExplanationLoading(false)
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [computed, language])

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
        min: fieldRange(inputs.heatingType, "annualFuelUse").min,
        max: fieldRange(inputs.heatingType, "annualFuelUse").max,
        // Therms tip specifically for gas; the general "annual heating use" tip
        // otherwise (it names gallons/kWh too).
        infoTerm:
          inputs.heatingType === "gas"
            ? ("therms" as const)
            : ("annualHeatingUse" as const),
      },
      {
        key: "fuelUnitPrice" as FieldKey,
        label: "Fuel price",
        value: inputs.fuelUnitPrice,
        unit: units.price,
        evidence: extraction.fuelUnitPrice?.evidence,
        confirmed: confirmed.fuelUnitPrice,
        min: fieldRange(inputs.heatingType, "fuelUnitPrice").min,
        max: fieldRange(inputs.heatingType, "fuelUnitPrice").max,
      },
    ]
  }, [extraction, inputs, confirmed])

  return (
    <div>
      {/* ================= VIDEO HERO (always at the top) ================= */}
      <section className="relative flex min-h-svh w-full flex-col overflow-hidden text-white">
        {/* Background: a full-screen autoplaying, looping, muted video
            (/hero.mp4) with /hero.jpg as the poster. Under prefers-reduced-motion
            the video does not autoplay — the static poster shows instead
            (heroAutoplay is false until the mount effect confirms motion is
            allowed, so SSR renders the poster). */}
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
            <source src="/hero.mp4" type="video/mp4" />
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

        {/* Bottom-pinned hero content. relative z-10 keeps it above the bottom
            legibility gradient so the buttons/subhead/tag are not greyed out.
            The headline spans up to max-w-4xl (not a 2-column grid) so it breaks
            onto exactly two lines at 1280px; the glass tag sits bottom-right on
            the same row as the buttons. */}
        <div className="relative z-10 flex flex-1 flex-col justify-end gap-6 px-6 pb-12 md:px-12 lg:px-16 lg:pb-16">
          <div className="max-w-4xl">
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
              <p className="text-base text-white/85 md:text-lg">
                Upload a bill. Get an honest answer, with the source under
                every number.
              </p>
            </FadeIn>
          </div>

          {/* Bottom row: buttons (left) + glass tag (right). */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <FadeIn delay={1200}>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  className="rounded-lg bg-white px-8 py-3 font-medium text-black transition-colors hover:bg-gray-100"
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
              <h2 className="mb-6 text-lg font-medium">
                Step 1 · Tell us about your home
              </h2>
              <UploadCard
                zip={zip}
                heatIncludedInRent={heatIncludedInRent}
                onZipChange={handleZipChange}
                onRentToggle={handleRentToggle}
                onBillSelected={handleBillSelected}
                onTryDemo={handleTryDemo}
                onManualSubmit={handleManualSubmit}
                onGuessResolved={handleGuessResolved}
                openManualSignal={openManualSignal}
                manualSeedType={manualSeedType}
              />

              {/* Extraction status: a brief loading note, then (on a soft/hard
                  failure) the "extraction unsuccessful" notice above results. */}
              {isExtracting ? (
                <p
                  role="status"
                  className="mt-4 text-sm text-muted-foreground"
                >
                  Reading your bill…
                </p>
              ) : extractionNotice ? (
                <Alert className="mt-4 border-amber-500 bg-amber-50/60 text-amber-900">
                  <AlertTitle className="text-amber-900">
                    Extraction unsuccessful
                  </AlertTitle>
                  <AlertDescription className="text-amber-900">
                    {extractionNotice}
                  </AlertDescription>
                </Alert>
              ) : null}
            </section>

            {/* "How it works" — shown only in the empty state; once results are
                showing it is hidden and the navbar link scrolls to the
                always-present footer copy instead. */}
            {!hasData ? (
            <section className="scroll-mt-6">
              <Card className="rounded-2xl p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-medium">How it works</h2>
                <ol className="flex flex-col gap-3 text-sm text-foreground">
                  <li className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-emerald-600 text-xs font-medium tabular-nums text-emerald-600"
                    >
                      1
                    </span>
                    <span>Upload a bill or try a demo home.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-emerald-600 text-xs font-medium tabular-nums text-emerald-600"
                    >
                      2
                    </span>
                    <span>We read it and you confirm the numbers.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-emerald-600 text-xs font-medium tabular-nums text-emerald-600"
                    >
                      3
                    </span>
                    <span>
                      Get an honest verdict, with the source under every number.
                    </span>
                  </li>
                </ol>
              </Card>
            </section>
            ) : null}

            {hasData && computed ? (
              <div ref={resultsRef} className="flex flex-col gap-6 pb-6">
                <VerdictCard
                  verdict={computed!.verdict}
                  annualDeltaDollars={computed!.cmp.annualDeltaDollars}
                  explanation={explanation}
                  explanationLoading={explanationLoading}
                  language={language}
                  isEstimate={isEstimate}
                  isDemo={isDemo}
                  netInstallCost={computed!.reb.netInstallCost}
                  paybackYears={computed!.reb.paybackYears}
                  onLanguageChange={setLanguage}
                />

                {/* Renter/landlord path — directly under the verdict, only while
                    "heat included in rent" is on (Req 7.1 / 7.4 / FIX 5). */}
                {inputs!.heatIncludedInRent ? (
                  <LandlordBox
                    heatingType={inputs!.heatingType}
                    tier={computed!.reb.tier}
                    rebateAmount={computed!.reb.rebateAmount}
                    netInstallCost={computed!.reb.netInstallCost}
                    paybackYears={computed!.reb.paybackYears}
                    annualDeltaDollars={computed!.cmp.annualDeltaDollars}
                  />
                ) : null}

                {/* Balanced results rows (FIX 6): two equal-width columns per
                    row so neither column is left with a large empty space. */}
                {/* Row 1: cost chart | your numbers. */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <CostChartCard
                    currentAnnualCost={computed!.cmp.currentAnnualCost}
                    heatPumpAnnualCost={computed!.cmp.heatPumpAnnualCost}
                    breakevenCOP={computed!.cmp.breakevenCOP}
                    typicalCOP={assumptions!.heatPumpCOP}
                  />
                  <Card className="rounded-2xl p-6 shadow-sm">
                    <YourNumbersCard
                      fields={editableFields}
                      heatingType={inputs!.heatingType}
                      onFieldConfirm={handleFieldConfirm}
                      onFieldEdit={handleFieldEdit}
                      onHeatingTypeChange={handleHeatingTypeChange}
                    />
                  </Card>
                </div>

                {/* Optional tweaks heading — Row 2 is a fine-tune step. */}
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-medium">
                    Want to fine-tune? (optional)
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Adjust the assumptions and rebate details to match your
                    situation. The verdict updates live.
                  </p>
                </div>

                {/* Row 2: assumptions | rebates. */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <AssumptionsCard
                    assumptions={assumptions!}
                    fuelUnitPrice={inputs!.fuelUnitPrice}
                    heatingType={inputs!.heatingType}
                    onChangeCOP={handleCOPChange}
                    onChangeElectricityPrice={handleElectricityPriceChange}
                    onChangeFuelPrice={handleFuelPriceChange}
                    onToggleSeasonalRate={handleSeasonalRateToggle}
                  />
                  <RebatesCard
                    result={computed!.reb}
                    inputs={inputs!}
                    onHouseholdSizeChange={handleHouseholdSizeChange}
                    onIncomeChange={handleIncomeChange}
                  />
                </div>

                <NextStepRow zip={inputs!.zip} onZipChange={handleZipChange} />
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

      {/* Footer — always-visible Sources list + "Your bill is never stored". */}
      <footer
        ref={footerRef}
        className="mx-auto mt-10 max-w-5xl scroll-mt-6 border-t px-6 pt-6 pb-10 text-sm text-muted-foreground"
      >
        <section
          ref={howItWorksRef}
          id="how-it-works"
          className="mb-6 flex scroll-mt-6 flex-col gap-2"
        >
          <span className="text-sm font-medium text-foreground">How it works</span>
          <ol className="flex flex-col gap-1">
            <li>1. Upload a bill or try a demo home.</li>
            <li>2. We read it and you confirm the numbers.</li>
            <li>3. Get an honest verdict, with the source under every number.</li>
          </ol>
        </section>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Sources</span>
          <div className="flex flex-col gap-1">
            <SourceLink
              label="U.S. EIA"
              href="https://www.eia.gov/energyexplained/units-and-calculators/"
            />
            <SourceLink
              label="U.S. DOE"
              href="https://www.energy.gov/energysaver/furnaces-and-boilers"
            />
            <SourceLink
              label="Mass.gov"
              href="https://www.mass.gov/info-details/residential-electric-seasonal-heat-pump-rates"
            />
            <SourceLink label="Mass Save" href="https://www.masssave.com/" />
            <SourceLink
              label="Analyze Boston (BERDO 2021)"
              href="https://data.boston.gov/dataset/building-energy-reporting-and-disclosure-ordinance"
            />
          </div>
        </div>
        <p className="mt-4">

          A first-pass estimate, not financial advice. A free Mass Save home energy

          assessment gives you exact numbers.

        </p>

        <a

          href="https://github.com/aayush24rai/heatswitch"

          target="_blank"

          rel="noreferrer noopener"

          className="mt-2 inline-block underline-offset-4 hover:text-foreground hover:underline"

        >

          View source on GitHub

        </a>

        <p className="mt-4">Your bill is never stored</p>
      </footer>
    </div>
  )
}
