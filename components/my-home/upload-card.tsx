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

/**
 * UploadCard — the intake card (Intake_UI) for the "My home" tab.
 *
 * Collects a bill (photo/PDF), a 5-digit zip, the "Heat included in my rent"
 * toggle, and the three "Try a demo home" buttons (Requirements 1.6–1.11).
 *
 * This card is presentational/stateful-at-the-edges only: it captures the
 * File and raises it via `onBillSelected` (real extraction arrives in task 6),
 * validates the zip shape before raising it via `onZipChange`, and raises the
 * demo selection via `onTryDemo`. All computed state lives in the page.
 */
export interface UploadCardProps {
  /** Current 5-digit zip value (controlled from the page). */
  zip: string
  /** Current "Heat included in my rent" toggle state. */
  heatIncludedInRent: boolean
  /** Called with the latest zip text as the user types. */
  onZipChange: (zip: string) => void
  /** Called when the rent toggle flips. */
  onRentToggle: (included: boolean) => void
  /** Called with the selected bill File (photo/PDF). Extraction is task 6. */
  onBillSelected: (file: File) => void
  /** Called when a demo button is clicked. */
  onTryDemo: (demo: DemoHome) => void
}

const DEMO_ORDER: DemoHome[] = ["oil", "gas", "baseboard"]

export function UploadCard({
  zip,
  heatIncludedInRent,
  onZipChange,
  onRentToggle,
  onBillSelected,
  onTryDemo,
}: UploadCardProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = React.useState(false)
  const zipId = React.useId()

  const zipValid = /^\d{5}$/.test(zip)
  const showZipError = zip.length > 0 && !zipValid

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      onBillSelected(file)
    }
    // Reset so selecting the same file again still fires a change event.
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
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

  // Only digits, max 5 — matches the ^\d{5}$ pattern the page enforces.
  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.replace(/\D/g, "").slice(0, 5)
    onZipChange(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start with your bill</CardTitle>
        <CardDescription>
          Upload a gas or electric bill, or try a demo home. Your bill is never
          stored.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Drop zone / file picker */}
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

        {/* Zip code + rent toggle */}
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

        {/* Try a demo home */}
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
                onClick={() => onTryDemo(demo)}
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
