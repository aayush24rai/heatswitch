"use client"

import { cn } from "cn"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import type { Language, Verdict } from "@/lib/schema"

/**
 * Default English explanation (<=200 chars) used as the fallback when the
 * /api/explain route times out or errors (Requirements 9.7 / 9.8). Exported so
 * the page can pass it straight back in as the `explanation` on failure.
 */
export const DEFAULT_EXPLANATION =
  "Here's the honest math from your numbers. Adjust the assumptions below to see how it changes."

/**
 * VerdictCard — the results-state hero (rendered full width at the top of the
 * "My home" tab by the page in task 3.5).
 *
 * Responsibilities (Requirements 6.1, 6.5, 6.6, 6.7, 6.8, 12.6):
 * - Show the single verdict label at `text-4xl font-semibold` (Req 6.1). The
 *   label is chosen upstream by `decideVerdict`; this component renders exactly
 *   the one it is handed.
 * - Directly below, show the big annual dollar figure at `text-6xl tabular-nums`
 *   (Req 12.6). Color by the SIGN of `annualDeltaDollars`: emerald for savings
 *   (delta > 0), amber for extra cost (delta < 0), neutral default text at
 *   exactly 0 (Req 6.5 / 6.6 / 6.7). Never red.
 * - Show the "Act before Dec 31" badge when `verdict.actBeforeDec31` is true
 *   (Req 6.8).
 * - Show a status line: "Demo home" for demo inputs, else "Estimate" (while
 *   any field is amber) → "Based on your bill".
 * - Offer a six-language dropdown (shadcn Select) that calls `onLanguageChange`.
 * - Render the explanation when present; otherwise show the default fallback
 *   sentence. (The real /api/explain route arrives in task 7.)
 */
export interface VerdictCardProps {
  verdict: Verdict
  /** current - heat pump, in $/yr. Positive = savings, negative = extra cost. */
  annualDeltaDollars: number
  /** Explanation prose, or null while it is still loading / not yet requested. */
  explanation: string | null
  /** True while an explanation request is in flight — renders a Skeleton (Req 9.6). */
  explanationLoading?: boolean
  language: Language
  isEstimate: boolean
  /** True when the loaded inputs came from a demo home (label reads "Demo home"). */
  isDemo: boolean
  /** Net install cost after rebates ($), from computeRebates. */
  netInstallCost: number
  /** Years to pay back the net install from savings; null when it never does. */
  paybackYears: number | null
  onLanguageChange: (lang: Language) => void
}

/** The six supported languages, labeled with their NATIVE names (shown both in
 *  the closed trigger and the open list). */
const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "cv", label: "Kabuverdianu" },
  { value: "zh", label: "中文" },
  { value: "ht", label: "Kreyòl ayisyen" },
  { value: "vi", label: "Tiếng Việt" },
]

/** Format a whole-dollar amount as "$X,XXX" (no cents; absolute value). */
function formatDollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(Math.round(value)))
}

export function VerdictCard({
  verdict,
  annualDeltaDollars,
  explanation,
  explanationLoading = false,
  language,
  isEstimate,
  isDemo,
  netInstallCost,
  paybackYears,
  onLanguageChange,
}: VerdictCardProps) {
  // Status line: a demo home reads "Demo home"; otherwise it flips from
  // "Estimate" (while any field is amber) to "Based on your bill".
  const statusLabel = isDemo
    ? "Demo home"
    : isEstimate
      ? "Estimate"
      : "Based on your bill"
  // Color the hero figure by the sign of the delta. Savings (delta > 0) read
  // emerald, extra cost (delta < 0) reads amber, and exactly 0 stays neutral.
  // We never use red (Req 6.5 / 6.6 / 6.7).
  const isSavings = annualDeltaDollars > 0
  const isExtraCost = annualDeltaDollars < 0

  const figureColor = isSavings
    ? "text-emerald-600"
    : isExtraCost
      ? "text-amber-600"
      : "text-foreground"

  // Caption makes the sign unambiguous even though the figure is an absolute
  // value: savings reads "saved per year", extra cost reads "more per year".
  const amount = formatDollars(annualDeltaDollars)
  const figureText = isExtraCost ? `+${amount}` : amount
  const caption = isSavings
    ? "saved per year"
    : isExtraCost
      ? "more per year"
      : "no change per year"

  // Payback line beneath the figure. When the home saves money AND the net
  // install pays back, show the net cost after rebates and the payback period
  // (years once >= 1 year, otherwise months). When it costs more to run there
  // is no payback — say so in amber (never red).
  const paybackPeriod =
    paybackYears === null
      ? null
      : paybackYears >= 1
        ? `${paybackYears.toFixed(1)} years`
        : `${Math.round(paybackYears * 12)} months`

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Step 3 · Your answer
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {statusLabel}
            </span>
            {verdict.actBeforeDec31 ? (
              <Badge>Act before Dec 31</Badge>
            ) : null}
          </div>
          <h2 className="text-4xl font-semibold tracking-tight">
            {verdict.label}
          </h2>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/* The hero figure. tabular-nums keeps digits aligned (Req 12.6). */}
        <div className="flex flex-col gap-1">
          <span className={cn("text-6xl font-semibold tabular-nums", figureColor)}>
            {figureText}
          </span>
          <span className="text-sm text-muted-foreground">{caption}</span>

          {/* Payback line. */}
          {isSavings && paybackPeriod !== null ? (
            <span className="text-sm tabular-nums text-muted-foreground">
              You pay {formatDollars(netInstallCost)} after rebates · pays back
              in {paybackPeriod}
            </span>
          ) : !isSavings ? (
            <span className="text-sm tabular-nums text-amber-600">
              Costs more to run, so no payback
            </span>
          ) : null}

          {/* Plain-words one-line meaning, computed HERE from the passed
              annualDeltaDollars — never from the explanation service (Req 9.9).
              Savings reads emerald, extra cost reads amber (never red). */}
          <span
            className={cn(
              "text-sm",
              isSavings
                ? "text-emerald-600"
                : isExtraCost
                  ? "text-amber-600"
                  : "text-foreground"
            )}
          >
            {isSavings
              ? `A heat pump would save you about ${amount} a year.`
              : isExtraCost
                ? `A heat pump would cost you about ${amount} more per year than your heating now.`
                : "A heat pump would cost about the same to run as your heating now."}
          </span>
        </div>

        {/* Explanation slot. While a request is in flight show a Skeleton and
            keep every number above visible (Req 9.6); otherwise render the prose
            (or the default fallback when none is passed — Req 9.7 / 9.8). The
            numbers on screen always come from the engine, never the explanation
            service (Req 9.9). */}
        <div className="flex flex-col gap-2">
          {/* Language picker — sits directly above the explanation. Only the
              explanation text changes language; every number stays as-is. */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Explain in:</span>
            <Select
              value={language}
              onValueChange={(value) => onLanguageChange(value as Language)}
            >
              <SelectTrigger
                aria-label="Explanation language"
                className="font-medium"
              >
                <span data-slot="select-value">
                  {LANGUAGE_OPTIONS.find((o) => o.value === language)?.label ??
                    "English"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {explanationLoading ? (
            <div className="flex flex-col gap-2" aria-hidden>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground">
              {explanation ?? DEFAULT_EXPLANATION}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
