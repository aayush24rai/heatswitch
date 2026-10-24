"use client"

import * as React from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DEMO_HOME_LABELS, type DemoHome } from "@/components/my-home/demo-homes"
import type { HeatingType } from "@/lib/schema"
import {
  guessHeatingType,
  type BillsAnswer,
  type RoomsAnswer,
} from "@/lib/heating-guess"

/**
 * UploadCard — the Step 1 intake (Intake_UI).
 *
 * Collects a bill (photo/PDF), a 5-digit zip, the rent toggle, the three demo
 * buttons, an inline "Not sure what heating you have?" helper (item 4), and an
 * always-available "Enter it yourself" manual form (item 5).
 */
export interface UploadCardProps {
  zip: string
  heatIncludedInRent: boolean
  onZipChange: (zip: string) => void
  onRentToggle: (included: boolean) => void
  onBillSelected: (file: File) => void
  onTryDemo: (demo: DemoHome) => void
  /** Manual entry (item 5): feeds the same results flow as a bill. */
  onManualSubmit: (
    heatingType: HeatingType,
    annualFuelUse: number,
    fuelUnitPrice: number
  ) => void
  /** Guesser: a resolved heating type (null = mini-split) + rent flag. The page
   *  only honors the rent flag; the manual form opens here with the type. */
  onGuessResolved: (
    heatingType: HeatingType | null,
    rentIncluded: boolean
  ) => void
  /** Bumped by the page to (re)open the manual form — e.g. after a Step-2
   *  "Change" cleared the units. Each new value triggers an open. */
  openManualSignal?: number
  /** When the manual form (re)opens via the signal, preselect this type. */
  manualSeedType?: HeatingType | null
}

const DEMO_ORDER: DemoHome[] = ["oil", "gas", "baseboard"]

/** Manual-form heating options + the native unit and a "where to find it" hint. */
const MANUAL_TYPES: {
  value: HeatingType
  label: string
  unit: string
  useHint: string
  priceHint: string
}[] = [
  {
    value: "gas",
    label: "Gas",
    unit: "therms",
    useHint: "On your gas bill, look for total therms used over the year.",
    priceHint: "Your gas bill shows a price per therm (often $1–$3).",
  },
  {
    value: "oil",
    label: "Oil",
    unit: "gallons",
    useHint: "Add up the gallons from your oil delivery receipts for the year.",
    priceHint: "Your delivery receipt shows the price per gallon.",
  },
  {
    value: "electric-resistance",
    label: "Electric baseboard",
    unit: "kWh",
    useHint: "On your electric bill, use the winter heating kWh for the year.",
    priceHint: "Your electric bill shows a price per kWh (often $0.20–$0.35).",
  },
  {
    value: "propane",
    label: "Propane",
    unit: "gallons",
    useHint: "Add up the gallons from your propane delivery receipts.",
    priceHint: "Your delivery receipt shows the price per gallon.",
  },
]

const ROOMS_OPTIONS: { value: RoomsAnswer; label: string }[] = [
  { value: "radiators", label: "Radiators" },
  { value: "vents", label: "Floor or wall vents" },
  { value: "baseboard-strips", label: "Thin baseboard strips along the wall" },
  { value: "white-wall-unit", label: "A white wall unit" },
]

const BILLS_OPTIONS: { value: BillsAnswer; label: string }[] = [
  { value: "gas", label: "Gas bill" },
  { value: "oil-propane", label: "Oil or propane deliveries" },
  { value: "electric-only", label: "Only electric" },
]

export function UploadCard({
  zip,
  heatIncludedInRent,
  onZipChange,
  onRentToggle,
  onBillSelected,
  onTryDemo,
  onManualSubmit,
  onGuessResolved,
  openManualSignal,
  manualSeedType,
}: UploadCardProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = React.useState(false)
  const zipId = React.useId()

  // Manual-entry form state (item 5).
  const [manualOpen, setManualOpen] = React.useState(false)
  const [manualType, setManualType] = React.useState<HeatingType>("gas")
  const [manualUse, setManualUse] = React.useState("")
  const [manualPrice, setManualPrice] = React.useState("")
  const [manualError, setManualError] = React.useState<string | null>(null)
  // Ref to the yearly-use input so the guesser / Change flow can focus it.
  const useInputRef = React.useRef<HTMLInputElement>(null)
  function focusUseField() {
    requestAnimationFrame(() => useInputRef.current?.focus())
  }

  // Reopen the manual form on the page's signal (e.g. after a Step-2 "Change").
  React.useEffect(() => {
    if (!openManualSignal) return
    if (manualSeedType) setManualType(manualSeedType)
    setManualUse("")
    setManualPrice("")
    setManualError(null)
    setManualOpen(true)
    setGuideOpen(false)
    focusUseField()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openManualSignal])

  // Guesser state (item 4).
  const [guideOpen, setGuideOpen] = React.useState(false)
  const [rooms, setRooms] = React.useState<RoomsAnswer | null>(null)
  const [bills, setBills] = React.useState<BillsAnswer | null>(null)
  const [rentAnswer, setRentAnswer] = React.useState<boolean | null>(null)

  const zipValid = /^\d{5}$/.test(zip)
  const showZipError = zip.length > 0 && !zipValid

  const manualTypeMeta =
    MANUAL_TYPES.find((t) => t.value === manualType) ?? MANUAL_TYPES[0]

  function openFilePicker() {
    fileInputRef.current?.click()
  }
  function closeInputs() {
    setManualOpen(false)
    setGuideOpen(false)
  }
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      closeInputs()
      onBillSelected(file)
    }
    e.target.value = ""
  }
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      closeInputs()
      onBillSelected(file)
    }
  }
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!dragActive) setDragActive(true)
  }
  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
  }
  function handleDropZoneKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      openFilePicker()
    }
  }
  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    onZipChange(e.target.value.replace(/\D/g, "").slice(0, 5))
  }

  function submitManual() {
    const use = Number(manualUse.trim().replace(/,/g, ""))
    const price = Number(manualPrice.trim().replace(/,/g, ""))
    if (!(use > 0) || !(price > 0)) {
      setManualError("Enter a yearly use and a price, both greater than 0.")
      return
    }
    setManualError(null)
    onManualSubmit(manualType, use, price)
  }

  // When all three guesser answers are in, resolve and hand off to the page.
  function resolveGuess() {
    if (rooms === null || bills === null || rentAnswer === null) return
    const g = guessHeatingType(rooms, bills, rentAnswer)
    onGuessResolved(g.heatingType, rentAnswer)
    // If a concrete fossil/electric type was inferred, prime the manual form
    // with it and open it so the user just fills in use + price.
    if (g.heatingType) {
      setManualType(g.heatingType)
      setManualUse("")
      setManualPrice("")
      setManualError(null)
      setManualOpen(true)
      focusUseField()
    }
    setGuideOpen(false)
  }

  const guess =
    rooms !== null && bills !== null && rentAnswer !== null
      ? guessHeatingType(rooms, bills, rentAnswer)
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start with your bill</CardTitle>
        <CardDescription>
          Upload a gas or electric bill, enter it yourself, or try a demo home.
          Your bill is never stored.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Drop zone / file picker + "Enter it yourself" side by side. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a bill photo or PDF"
            onClick={openFilePicker}
            onKeyDown={handleDropZoneKeyDown}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              dragActive
                ? "border-primary bg-muted/60"
                : "border-input bg-muted/20 hover:bg-muted/40"
            )}
          >
            <span className="text-sm font-medium">
              Drop your bill here, or click to browse
            </span>
            <span className="text-xs text-muted-foreground">
              JPEG, PNG, or PDF
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>

          {/* Manual entry (item 5): always available next to upload. */}
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border p-6 text-center">
            <span className="text-sm font-medium">Prefer to type it in?</span>
            <span className="text-xs text-muted-foreground">
              No bill handy? Enter your numbers yourself.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={manualOpen}
              onClick={() => setManualOpen((v) => !v)}
            >
              {manualOpen ? "Hide manual entry" : "Enter it yourself"}
            </Button>
          </div>
        </div>

        {/* The manual form. */}
        {manualOpen ? (
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Heating type
              </span>
              <div className="flex flex-wrap gap-2">
                {MANUAL_TYPES.map((t) => (
                  <Button
                    key={t.value}
                    type="button"
                    size="sm"
                    variant={t.value === manualType ? "default" : "outline"}
                    onClick={() => setManualType(t.value)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="manual-use"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Yearly use ({manualTypeMeta.unit})
                </label>
                <input
                  ref={useInputRef}
                  id="manual-use"
                  type="text"
                  inputMode="decimal"
                  placeholder={manualTypeMeta.unit}
                  value={manualUse}
                  onChange={(e) => setManualUse(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">
                  {manualTypeMeta.useHint}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="manual-price"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Price per {manualTypeMeta.unit.replace(/s$/, "")}
                </label>
                <input
                  id="manual-price"
                  type="text"
                  inputMode="decimal"
                  placeholder="$"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">
                  {manualTypeMeta.priceHint}
                </span>
              </div>
            </div>

            {manualError ? (
              <p role="alert" className="text-xs text-destructive">
                {manualError}
              </p>
            ) : null}

            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={submitManual}
            >
              See my answer
            </Button>
          </div>
        ) : null}

        {/* "Not sure what heating you have?" inline helper (item 4). */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={guideOpen}
            onClick={() => setGuideOpen((v) => !v)}
            className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Not sure what heating you have?
          </button>

          {guideOpen ? (
            <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
              <GuideQuestion
                legend="What's in your rooms?"
                options={ROOMS_OPTIONS}
                value={rooms}
                onChange={setRooms}
              />
              <GuideQuestion
                legend="Which bills or deliveries do you get?"
                options={BILLS_OPTIONS}
                value={bills}
                onChange={setBills}
              />
              <GuideQuestion
                legend="Is heat included in your rent?"
                options={[
                  { value: true, label: "Yes" },
                  { value: false, label: "No" },
                ]}
                value={rentAnswer}
                onChange={setRentAnswer}
              />

              {guess ? (
                <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
                  <span className="text-sm">{guess.reason}</span>
                  <Button
                    type="button"
                    size="sm"
                    className="self-start"
                    onClick={resolveGuess}
                  >
                    {guess.miniSplit ? "Got it" : "Use this and enter my numbers"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Zip + rent toggle. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={zipId}
              className="text-xs font-medium text-muted-foreground"
            >
              Zip code
            </label>
            <input
              id={zipId}
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="02118"
              value={zip}
              onChange={handleZipChange}
              aria-invalid={showZipError || undefined}
              aria-describedby={showZipError ? `${zipId}-error` : undefined}
              className={cn(
                "h-8 w-32 rounded-md border bg-background px-2 text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                showZipError
                  ? "border-destructive focus-visible:ring-destructive/30"
                  : "border-input focus-visible:border-ring"
              )}
            />
            {showZipError ? (
              <p
                id={`${zipId}-error`}
                role="alert"
                className="text-xs text-destructive"
              >
                Enter a five-digit zip code.
              </p>
            ) : null}
          </div>

          <label className="flex items-center gap-2.5 sm:pt-6">
            <Switch
              checked={heatIncludedInRent}
              onCheckedChange={onRentToggle}
              aria-label="Heat included in my rent"
            />
            <span className="text-sm">Heat included in my rent</span>
          </label>
        </div>

        {/* Try a demo home. */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Or try a demo home
          </span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {DEMO_ORDER.map((demo) => (
              <Button
                key={demo}
                type="button"
                variant="outline"
                size="lg"
                className="h-auto flex-col items-start gap-0.5 py-3 text-left whitespace-normal"
                onClick={() => {
                  closeInputs()
                  onTryDemo(demo)
                }}
              >
                <span className="text-sm font-medium">
                  {DEMO_HOME_LABELS[demo]}
                </span>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** A single radio-like question rendered as a button group (no modal). */
function GuideQuestion<T extends string | boolean>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Button
            key={String(opt.value)}
            type="button"
            size="sm"
            variant={opt.value === value ? "default" : "outline"}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}
