"use client"

import * as React from "react"
import { cn } from "cn"
import type { HeatingType, RebateTier } from "@/lib/schema"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"

/**
 * LandlordBox — the renter/landlord path (Requirements 7.1 / 7.4).
 *
 * Shown directly under the VerdictCard when "heat included in rent" is on. It is
 * informational and computes NO number: it DISPLAYS a shareable, plain-text
 * summary built from values the engine already computed (heating type, Mass Save
 * tier + rebate, net install cost, payback, and the annual delta) and offers a
 * "Copy summary" button plus the Mass Save multifamily link.
 */

export interface LandlordBoxProps {
  heatingType: HeatingType
  tier: RebateTier
  rebateAmount: number
  netInstallCost: number
  /** Years to pay back, or null when a heat pump costs more to run. */
  paybackYears: number | null
  /** current - heat pump, $/yr. Positive = savings, negative = extra cost. */
  annualDeltaDollars: number
}

/** Mass Save multifamily / landlord next-step page (Req 7.1). */
const MASS_SAVE_MULTIFAMILY_URL =
  "https://www.masssave.com/saving/residential-rebates/multi-family-retrofit"

/** Human-readable tier label. */
const TIER_LABEL: Record<RebateTier, string> = {
  standard: "Standard",
  enhanced: "Enhanced",
  "income-eligible": "Income-eligible",
}

/** Human-readable heating type. */
const HEATING_TYPE_LABEL: Record<HeatingType, string> = {
  gas: "gas heat",
  oil: "oil heat",
  "electric-resistance": "electric baseboard heat",
  propane: "propane heat",
}

/** Format a whole-dollar amount as "$X,XXX" (absolute value, thousands sep). */
function formatDollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(Math.round(value)))
}

export function LandlordBox({
  heatingType,
  tier,
  rebateAmount,
  netInstallCost,
  paybackYears,
  annualDeltaDollars,
}: LandlordBoxProps) {
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Phrase the annual delta: savings (> 0) vs extra cost (< 0), never red.
  const deltaLine =
    annualDeltaDollars > 0
      ? `- Saves about ${formatDollars(annualDeltaDollars)} per year`
      : annualDeltaDollars < 0
        ? `- Costs about ${formatDollars(annualDeltaDollars)} more per year`
        : "- About the same to run per year"

  const paybackLine =
    paybackYears === null
      ? "- Payback: a heat pump costs more than the current system at these numbers"
      : `- Simple payback: about ${paybackYears.toFixed(1)} years`

  const summary = [
    "Heat pump opportunity for this unit:",
    `- Current heating: ${HEATING_TYPE_LABEL[heatingType]}`,
    `- Mass Save ${TIER_LABEL[tier]} rebate: ${formatDollars(rebateAmount)}`,
    `- Net install cost after rebate: ${formatDollars(netInstallCost)}`,
    paybackLine,
    deltaLine,
    "Next step: a Mass Save assessment for the building.",
  ].join("\n")

  function handleCopy() {
    void navigator.clipboard?.writeText(summary)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Alert>
      <AlertTitle>Renting? Share this with your landlord</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>
          You can&apos;t install a heat pump yourself, but your landlord can —
          and the building may qualify for Mass Save multifamily support. Send
          them this summary:
        </span>
        <pre className="rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap text-foreground tabular-nums">
          {summary}
        </pre>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? "Copied" : "Copy summary"}
          </Button>
          <a
            href={MASS_SAVE_MULTIFAMILY_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Mass Save landlord &amp; multifamily path
          </a>
        </div>
      </AlertDescription>
    </Alert>
  )
}
