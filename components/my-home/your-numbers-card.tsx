"use client"

import * as React from "react"
import { cn } from "cn"
import type { HeatingType } from "@/lib/schema"
import { ConfirmField } from "@/components/shared/confirm-field"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/**
 * YourNumbersCard — the editable "Step 2 · Check the numbers we read" card.
 *
 *  - One `ConfirmField` per editable extracted number (Req 3.2, 3.3, 11.2).
 *  - The heating-type chip "Looks like {…} heat." with [Yes] / [Change]
 *    (Req 3.7). "Change" opens an INLINE picker (Gas / Oil / Electric baseboard
 *    / Propane). Picking a type calls `onHeatingTypeChange`, which clears the
 *    usage/price (the page handles the reset so old numbers are never
 *    reinterpreted in the new fuel's units — item 6).
 *  - The "Estimate: N values need a quick check" banner (Req 3.4, 3.5).
 */

export type FieldKey = "annualFuelUse" | "fuelUnitPrice"

export interface EditableField {
  key: FieldKey
  label: string
  value: number
  unit: string
  evidence?: string
  confirmed: boolean
  min?: number
  max?: number
}

export interface YourNumbersCardProps {
  fields: EditableField[]
  heatingType: HeatingType
  onFieldConfirm: (key: FieldKey) => void
  onFieldEdit: (key: FieldKey, value: number) => void
  onHeatingTypeChange: (type: HeatingType) => void
}

/** Friendly phrasing for the heating-type chip (Req 3.7). */
const HEATING_TYPE_PHRASE: Record<HeatingType, string> = {
  gas: "gas heat",
  oil: "oil heat",
  "electric-resistance": "electric baseboard heat",
  propane: "propane heat",
}

/** The inline picker options, in display order, with human labels. */
const HEATING_TYPE_OPTIONS: { value: HeatingType; label: string }[] = [
  { value: "gas", label: "Gas" },
  { value: "oil", label: "Oil" },
  { value: "electric-resistance", label: "Electric baseboard" },
  { value: "propane", label: "Propane" },
]

export function YourNumbersCard({
  fields,
  heatingType,
  onFieldConfirm,
  onFieldEdit,
  onHeatingTypeChange,
}: YourNumbersCardProps) {
  const firstAmberRef = React.useRef<HTMLDivElement>(null)
  const [heatingTypeAcknowledged, setHeatingTypeAcknowledged] =
    React.useState(false)
  // Whether the inline heating-type picker is open.
  const [picking, setPicking] = React.useState(false)

  const unconfirmedCount = fields.reduce(
    (n, f) => (f.confirmed ? n : n + 1),
    0
  )
  const firstAmberIndex = fields.findIndex((f) => !f.confirmed)

  function scrollToFirstAmber() {
    firstAmberRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    })
  }

  function pickHeatingType(next: HeatingType) {
    setPicking(false)
    setHeatingTypeAcknowledged(false)
    // The page clears usage/price for the new fuel (item 6).
    onHeatingTypeChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Step 2 · Check the numbers we read</h2>

      {unconfirmedCount >= 1 ? (
        <Alert
          role="button"
          tabIndex={0}
          onClick={scrollToFirstAmber}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              scrollToFirstAmber()
            }
          }}
          className="cursor-pointer border-amber-500 bg-amber-50/60 text-amber-900 transition-colors hover:bg-amber-50"
        >
          <AlertTitle className="text-amber-900">
            {`Estimate: ${unconfirmedCount} ${
              unconfirmedCount === 1 ? "value needs" : "values need"
            } a quick check`}
          </AlertTitle>
        </Alert>
      ) : null}

      {/* Heating-type chip with an inline picker on "Change" (Req 3.7). */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-6">
            Looks like {HEATING_TYPE_PHRASE[heatingType]}.
          </Badge>
          {heatingTypeAcknowledged ? (
            <span className="text-xs text-muted-foreground">Confirmed</span>
          ) : (
            <>
              <Button
                type="button"
                size="xs"
                variant="default"
                onClick={() => setHeatingTypeAcknowledged(true)}
              >
                Yes
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                aria-expanded={picking}
                onClick={() => setPicking((v) => !v)}
              >
                Change
              </Button>
            </>
          )}
        </div>

        {/* Inline picker — no modal. Choosing a type clears usage/price. */}
        {picking ? (
          <div
            role="group"
            aria-label="Choose your heating type"
            className="flex flex-wrap gap-2"
          >
            {HEATING_TYPE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={opt.value === heatingType ? "default" : "outline"}
                onClick={() => pickHeatingType(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {/* One ConfirmField per editable extracted number. A value of 0 (after a
          type change) renders as an empty-ish amber field for re-entry. */}
      <div className="flex flex-col gap-3">
        {fields.map((field, i) => (
          <div
            key={field.key}
            ref={i === firstAmberIndex ? firstAmberRef : undefined}
            className={cn("scroll-mt-4")}
          >
            <ConfirmField
              label={field.label}
              value={field.value}
              unit={field.unit}
              evidence={field.evidence}
              confirmed={field.confirmed}
              min={field.min}
              max={field.max}
              onConfirm={() => onFieldConfirm(field.key)}
              onEdit={(value) => onFieldEdit(field.key, value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
