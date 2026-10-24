"use client"

import { cn } from "cn"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { Language, Verdict } from "@/lib/schema"

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
 * - Show an "Estimate" vs "Based on your bill" status line.
 * - Offer a six-language dropdown that calls `onLanguageChange`.
 * - Render the explanation when present; otherwise show a Skeleton placeholder.
 *   (Real explanation text arrives in task 7.)
 */
export interface VerdictCardProps {
  verdict: Verdict
  /** current - heat pump, in $/yr. Positive = savings, negative = extra cost. */
  annualDeltaDollars: number
  /** Explanation prose, or null while it is still loading / not yet requested. */
  explanation: string | null
  language: Language
  isEstimate: boolean
  onLanguageChange: (lang: Language) => void
}

/** The six supported languages, labeled in English for now (task 7 localizes). */
const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "cv", label: "Cape Verdean Creole" },
  { value: "zh", label: "Chinese" },
  { value: "ht", label: "Haitian Creole" },
  { value: "vi", label: "Vietnamese" },
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
  language,
  isEstimate,
  onLanguageChange,
}: VerdictCardProps) {
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

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {isEstimate ? "Estimate" : "Based on your bill"}
              </span>
              {verdict.actBeforeDec31 ? (
                <Badge>Act before Dec 31</Badge>
              ) : null}
            </div>
            <h2 className="text-4xl font-semibold tracking-tight">
              {verdict.label}
            </h2>
          </div>

          {/* Language dropdown. No shadcn Select is installed, so this is a
              native <select> styled to match the outline Button look. */}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="sr-only">Explanation language</span>
            <select
              aria-label="Explanation language"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value as Language)}
              className={cn(
                "h-8 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              )}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/* The hero figure. tabular-nums keeps digits aligned (Req 12.6). */}
        <div className="flex flex-col gap-1">
          <span className={cn("text-6xl font-semibold tabular-nums", figureColor)}>
            {figureText}
          </span>
          <span className="text-sm text-muted-foreground">{caption}</span>
        </div>

        {/* Explanation slot: Skeleton while null, prose once present. */}
        <div className="flex flex-col gap-2">
          {explanation === null ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="h-4 w-4/5" />
            </>
          ) : (
            <p className="text-sm leading-relaxed text-foreground">
              {explanation}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
