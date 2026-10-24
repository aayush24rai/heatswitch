"use client"

import * as React from "react"
import { cn } from "cn"
import type { HeatingType } from "@/lib/schema"
import { ConfirmField } from "@/components/shared/confirm-field"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/**
 * YourNumbersCard — the editable "Your numbers" card on the My home tab.
 *
 * Owns three things and NOTHING that computes a cost:
 *
 *  - One `ConfirmField` per editable extracted number (Req 3.2, 3.3, 11.2). The
 *    ConfirmField primitive already renders the value immediately, the amber
 *    outline when unconfirmed, the monospace evidence quote chip, and the inline
 *    [Looks right] / [Edit] flow with validation. This card only composes it and
 *    reports confirm/edit up to the page.
 *  - The heating-type chip reading "Looks like {…} heat." with [Yes] / [Change]
 *    (Req 3.7). "Change" cycles to the next HeatingType in place; "Yes"
 *    acknowledges the guess.
 *  - The "Estimate: N values need a quick check" banner (Req 3.4, 3.5). N is the
 *    count of unconfirmed fields. Activating the banner scrolls to the first
 *    amber field (Req 3.6). When N === 0 the banner is not rendered.
 *
 * Live recompute (Req 3.9, 3.10) and the verdict "Estimate" → "Based on your
 * bill" label flip (Req 3.8, 3.9) are the page's / VerdictCard's concern; this
 * card only emits callbacks and owns the N-count banner.
 */

/** The editable extracted numbers. `heatingType` is handled by the chip, not here. */
export type FieldKey = "annualFuelUse" | "fuelUnitPrice"

/** One editable row rendered as a ConfirmField. */
export interface EditableField {
  key: FieldKey
  label: string
  value: number
  unit: string
  evidence?: string
  confirmed: boolean
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

/** Stable order used when cycling heating types via "Change". */
const HEATING_TYPE_ORDER: HeatingType[] = [
  "gas",
  "oil",
  "electric-resistance",
  "propane",
]

export function YourNumbersCard({
  fields,
  heatingType,
  onFieldConfirm,
  onFieldEdit,
  onHeatingTypeChange,
}: YourNumbersCardProps) {
  // Ref to the first unconfirmed field so the banner can scroll to it (Req 3.6).
  const firstAmberRef = React.useRef<HTMLDivElement>(null)

  // The user can "Yes"-acknowledge the heating-type guess; that just dismisses
  // the Yes/Change actions, it does not change the value.
  const [heatingTypeAcknowledged, setHeatingTypeAcknowledged] =
    React.useState(false)

  // N = number of fields still needing a quick check (Req 3.4, 3.5).
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

  function cycleHeatingType() {
    const i = HEATING_TYPE_ORDER.indexOf(heatingType)
    const next =
      HEATING_TYPE_ORDER[(i + 1) % HEATING_TYPE_ORDER.length]
    setHeatingTypeAcknowledged(false)
    onHeatingTypeChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Your numbers</h2>

      {/* Banner: "Estimate: N values need a quick check" — only while N >= 1. */}
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

      {/* Heating-type chip (Req 3.7). */}
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
              onClick={cycleHeatingType}
            >
              Change
            </Button>
          </>
        )}
      </div>

      {/* One ConfirmField per editable extracted number. */}
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
              min={0}
              onConfirm={() => onFieldConfirm(field.key)}
              onEdit={(value) => onFieldEdit(field.key, value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
