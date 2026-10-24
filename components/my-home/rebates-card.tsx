"use client"

import * as React from "react"
import { cn } from "cn"
import type { HomeInputs, RebateTier } from "@/lib/schema"
import type { RebateResult } from "@/lib/rebates"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SourceLink } from "@/components/shared/source-link"
import { InfoTip } from "@/components/shared/info-tip"
import { REBATE_DEADLINE_NOTE } from "@/lib/constants"

/**
 * Glossary terms for the four eligibility requirement items, in the same order
 * as REBATE_REQUIREMENTS (lib/constants.ts): assessment, weatherization,
 * network installer, refrigerant. Matched by index so each item gets the right
 * plain-English tooltip without re-parsing its text.
 */
const REQUIREMENT_TERMS = [
  "homeEnergyAssessment",
  "weatherization",
  "networkInstaller",
  "refrigerant",
] as const

/**
 * RebatesCard — the Mass Save rebate, net cost, payback, requirements, deadline
 * note, and (while the rent toggle is on) the renter/landlord path
 * (Requirements 5.7, 5.8, 5.10, 5.11, 7.1, 7.4).
 *
 * Every dollar figure here comes from `computeRebates` (lib/rebates.ts) — this
 * card DISPLAYS values and computes no number. All dollars use tabular-nums with
 * a grey SourceLink to masssave.com beneath; savings/affordability never uses
 * red (payback "never" reads amber-600 per the design).
 */

export interface RebatesCardProps {
  result: RebateResult
  inputs: HomeInputs
  /** Patch inputs.householdSize (integer 1–8) live so the tier re-selects. */
  onHouseholdSizeChange: (size: number) => void
  /** Patch inputs.annualIncome live (undefined when blank) so the tier re-selects. */
  onIncomeChange: (income: number | undefined) => void
}

const MASS_SAVE_URL = "https://www.masssave.com/"

/** Human-readable tier label (Req 5.x). */
const TIER_LABEL: Record<RebateTier, string> = {
  standard: "Standard",
  enhanced: "Enhanced",
  "income-eligible": "Income-eligible",
}

/** Format a whole-dollar amount as "$X,XXX". */
function formatDollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

/** A dollar stat with its label above. The single Mass Save source link now
 *  lives once at the bottom of the card (not under every number). */
function DollarStat({
  label,
  value,
}: {
  label: React.ReactNode
  value: number
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">
        {formatDollars(value)}
      </span>
    </div>
  )
}

export function RebatesCard({
  result,
  inputs,
  onHouseholdSizeChange,
  onIncomeChange,
}: RebatesCardProps) {
  const noPayback = result.paybackYears === null

  // Household size is an integer 1–8; empty income maps to undefined (Standard).
  function handleHouseholdSizeInput(e: React.ChangeEvent<HTMLInputElement>) {
    // Single-digit field: the newest digit typed replaces the old one, so
    // typing "4" over "3" gives 4 (not "34" clamped to 8). 1–8 only.
    const last = e.target.value.replace(/\D/g, "").slice(-1)
    if (last === "") return
    const n = parseInt(last, 10)
    if (n >= 1 && n <= 8) onHouseholdSizeChange(n)
  }

  function handleIncomeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "")
    onIncomeChange(digits === "" ? undefined : parseInt(digits, 10))
  }

  return (
    <Card className="rounded-2xl p-6 shadow-sm">
      <CardHeader className="p-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg font-medium">
            Rebates
            <InfoTip term="massSave" label="Mass Save" className="ml-1" />
          </CardTitle>
          <span className="inline-flex items-center gap-1">
            <Badge variant="outline">{TIER_LABEL[result.tier]} tier</Badge>
            <InfoTip term="rebateTier" label="Rebate tier" />
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 p-0 pt-4">
        {/* Household size + income feed selectRebateTier live. These inputs are
            display-only intake; all dollar math stays in computeRebates. */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="rebate-household-size"
              className="text-xs text-muted-foreground"
            >
              Household size
            </label>
            <input
              id="rebate-household-size"
              type="text"
              inputMode="numeric"
              placeholder="1–8"
              value={inputs.householdSize ?? ""}
              onChange={handleHouseholdSizeInput}
              onFocus={(e) => e.currentTarget.select()}
              className="h-8 rounded-md border bg-background px-2 text-sm tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="rebate-income"
              className="text-xs text-muted-foreground"
            >
              Annual household income
            </label>
            <input
              id="rebate-income"
              type="text"
              inputMode="numeric"
              placeholder="$ (optional)"
              value={inputs.annualIncome ?? ""}
              onChange={handleIncomeInput}
              className="h-8 rounded-md border bg-background px-2 text-sm tabular-nums"
            />
          </div>
        </div>

        {/* Dollar figures. */}
        <div className="grid grid-cols-2 gap-4">
          <DollarStat label="Rebate amount" value={result.rebateAmount} />
          <DollarStat
            label={
              <>
                Net install cost
                <InfoTip
                  term="netInstallCost"
                  label="Net install cost"
                  className="ml-1"
                />
              </>
            }
            value={result.netInstallCost}
          />
        </div>

        {/* Payback — amber (never red) when the heat pump costs more (Req 5.8). */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            Payback
            <InfoTip term="payback" label="Payback" className="ml-1" />
          </span>
          <span
            className={cn(
              "text-xl font-semibold tabular-nums",
              noPayback && "text-amber-600"
            )}
          >
            {noPayback
              ? "No payback (heat pump costs more)"
              : `${result.paybackYears!.toFixed(1)} years`}
          </span>
        </div>

        {/* Tier-selection notes (surfaced only when present; never affect math). */}
        {result.invalidHouseholdSize ? (
          <p className="text-xs text-muted-foreground">
            Household size wasn&apos;t recognized, so we used the Standard tier.
          </p>
        ) : null}
        {result.checkIncomeLimits ? (
          <p className="text-xs text-muted-foreground">
            For households of 6+, confirm your income limits at{" "}
            <SourceLink
              label="masssave.com/income"
              href="https://www.masssave.com/income"
              className="text-xs"
            />
            .
          </p>
        ) : null}

        {/* Four-item eligibility checklist (Req 5.10). */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Eligibility requirements</span>
          <ul className="flex flex-col gap-1.5">
            {result.requirements.map((req, i) => (
              <li
                key={req}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-emerald-600 text-[10px] leading-none text-emerald-600"
                >
                  ✓
                </span>
                <span>
                  {req}
                  {REQUIREMENT_TERMS[i] ? (
                    <InfoTip
                      term={REQUIREMENT_TERMS[i]}
                      label={req}
                      className="ml-1"
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Exact deadline note (Req 5.11). */}
        <p className="text-xs text-muted-foreground">{REBATE_DEADLINE_NOTE}</p>

        {/* The renter/landlord path now renders in the page directly under the
            VerdictCard (see components/my-home/landlord-box.tsx), not here. */}

        {/* Single source link for the whole card (Req 11.1 / FIX 6). */}
        <SourceLink label="Mass Save rebates" href={MASS_SAVE_URL} />
      </CardContent>
    </Card>
  )
}
