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
 * /api/explain route times out or errors (Requirements 9.7 / 9.8).
 */
export const DEFAULT_EXPLANATION =
  "Here's the honest math from your numbers. Adjust the assumptions below to see how it changes."

/**
 * VerdictCard — the results-state hero. Content order (top → bottom):
 *   1. small status label (Demo home / Estimate / Based on your bill)
 *   2. verdict label (text-4xl font-semibold)
 *   3. plain one-line meaning (text-lg), computed from the delta in code
 *   4. the dollar figure (no "+"; reads "$403 more per year" / "$2,630 saved per year")
 *   5. payback line
 *   6. explanation inside a tinted callout ("Why we say this") with the
 *      "Explain in:" language picker in the callout's top-right corner.
 *
 * Every number comes from the engine; the explanation service never supplies a
 * number (Req 9.9).
 */
export interface VerdictCardProps {
  verdict: Verdict
  /** current - heat pump, in $/yr. Positive = savings, negative = extra cost. */
  annualDeltaDollars: number
  explanation: string | null
  explanationLoading?: boolean
  language: Language
  isEstimate: boolean
  isDemo: boolean
  netInstallCost: number
  paybackYears: number | null
  onLanguageChange: (lang: Language) => void
}

/** The six supported languages, labeled with their NATIVE names. */
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
  const statusLabel = isDemo
    ? "Demo home"
    : isEstimate
      ? "Estimate"
      : "Based on your bill"

  const isSavings = annualDeltaDollars > 0
  const isExtraCost = annualDeltaDollars < 0

  const figureColor = isSavings
    ? "text-emerald-600"
    : isExtraCost
      ? "text-amber-600"
      : "text-foreground"

  const amount = formatDollars(annualDeltaDollars)
  // No "+" sign ever. The figure reads together with its caption as words:
  // "$403 more per year" / "$2,630 saved per year" / "no change per year".
  const figureText = amount
  const caption = isSavings
    ? "saved per year"
    : isExtraCost
      ? "more per year"
      : "no change per year"

  const paybackPeriod =
    paybackYears === null
      ? null
      : paybackYears >= 1
        ? `${paybackYears.toFixed(1)} years`
        : `${Math.round(paybackYears * 12)} months`

  // Tinted callout background by sign (emerald-50 savings / amber-50 extra cost
  // / neutral at zero). Never red.
  const calloutClass = isSavings
    ? "bg-emerald-50"
    : isExtraCost
      ? "bg-amber-50"
      : "bg-muted"

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Step 3 · Your answer
          </span>
          {/* 1. Small status label (+ Act-before-Dec-31 badge). */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{statusLabel}</span>
            {verdict.actBeforeDec31 ? <Badge>Act before Dec 31</Badge> : null}
          </div>
          {/* 2. Verdict label. */}
          <h2 className="text-4xl font-semibold tracking-tight">
            {verdict.label}
          </h2>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {/* 3. Plain one-line meaning (text-lg), computed in code. */}
          <span
            className={cn(
              "text-lg",
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

          {/* 4. The dollar figure + words caption (no "+" sign). */}
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "text-6xl font-semibold tabular-nums",
                figureColor
              )}
            >
              {figureText}
            </span>
            <span className="text-sm text-muted-foreground">{caption}</span>
          </div>

          {/* 5. Payback line. */}
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
        </div>

        {/* 6. Explanation in a tinted callout with the language picker in the
            top-right corner. Numbers never come from the explanation (Req 9.9). */}
        <div className={cn("flex flex-col gap-3 rounded-xl p-5", calloutClass)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              Why we say this
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Explain in:</span>
              <Select
                value={language}
                onValueChange={(value) => onLanguageChange(value as Language)}
              >
                <SelectTrigger
                  aria-label="Explanation language"
                  className="h-8 bg-background font-medium"
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
          </div>

          {explanationLoading ? (
            <div className="flex flex-col gap-2" aria-hidden>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : (
            <p className="text-base leading-relaxed text-foreground">
              {explanation ?? DEFAULT_EXPLANATION}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
