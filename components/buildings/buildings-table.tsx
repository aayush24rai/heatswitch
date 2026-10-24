"use client"

import * as React from "react"
import { cn } from "cn"
import type { BerdoBuilding } from "@/lib/schema"
import {
  rankBuildings,
  sharesInconsistent,
  type RankedBuilding,
} from "@/lib/calc"
import { Badge } from "@/components/ui/badge"
import { SourceLink } from "@/components/shared/source-link"
import { InfoTip } from "@/components/shared/info-tip"
import { ZipPicker } from "@/components/buildings/zip-picker"

/**
 * BuildingsTable — the ranked Boston multifamily table on the Buildings tab
 * (Buildings_View, Requirements 8.2, 8.6, 8.8, 8.9, 8.10, 8.11).
 *
 * This component is presentational over the cleaned BERDO rows it is given
 * (task 5.3 loads `buildings.json` client-side and passes it in). It computes
 * NO heating number and NO ranking: the cohort filter, dedupe, fossil-intensity
 * score, percentiles, labels, and the check-data split ALL live in
 * `rankBuildings` (`lib/calc.ts`, reworked in task 9.1). The table reads the
 * per-row flags — `percentile`, `label`, `checkData`, `electricResistanceWin` —
 * straight off each `RankedBuilding` and never re-derives them.
 *
 * To keep the summary strip and the displayed rows describing the SAME set, the
 * component ranks the full cohort once (`rankBuildings(buildings, null)`) and
 * reuses it: the summary stats and the citywide top-25 both come from that
 * ranked cohort, and the zip-filtered view re-ranks with the chosen zip. The
 * only arithmetic here is dataset-descriptive summary statistics (counts and a
 * median) over the VALID cohort (cohort rows with `checkData === false`),
 * derived at render time so the strip stays correct if the dataset changes.
 *
 * Default view (no zip): the top 25 of the ranked cohort citywide, with a note
 * to pick a zip. With a zip selected: ALL matching cohort rows (no cap), in the
 * order `rankBuildings` returns them (valid first, check-data last;
 * Requirement 8.10). No match => empty-state row while the picker stays usable
 * (Requirement 8.11). An empty `buildings` array renders zeroed stats and a
 * friendly note (the load-error Alert itself is the loader's job in task 5.3,
 * Requirement 8.2).
 */

export interface BuildingsTableProps {
  /** Cleaned BERDO rows. May be empty (handled gracefully). */
  buildings: BerdoBuilding[]
  /** Currently selected zip, or `null` for all of Boston. */
  selectedZip: string | null
  /** Called when the user picks a zip (or the all-zips option). */
  onZipChange: (zip: string | null) => void
  className?: string
}

/** How many citywide rows to show when no zip is selected. */
const DEFAULT_CITYWIDE_LIMIT = 25

/** BERDO dataset source page (opens in a new tab). */
const BERDO_SOURCE_URL =
  "https://data.boston.gov/dataset/building-energy-reporting-and-disclosure-ordinance"

// --- small pure formatting + stats helpers (dataset-descriptive only) -------

/** Standard median of a numeric list; `null` for an empty list. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

const intFmt = new Intl.NumberFormat("en-US")

/** Site EUI, one decimal place, with thousands separators when >= 1,000 (FIX 9). */
const eui1Fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function formatSqFt(n: number): string {
  return `${intFmt.format(Math.round(n))} sqft`
}

/** Format a 0..1 share as a percent; `null` gas share shows "—" (Req 8.5). */
function formatShare(share: number | null): string {
  if (share === null) return "—"
  return `${Math.round(share * 100)}%`
}

/** Compact, address-free row identity (the dataset has NO addresses). */
function rowIdentity(b: BerdoBuilding): string {
  return `${b.propertyType} · ${b.yearBuilt} · ${formatSqFt(b.grossFloorAreaSqFt)} · ${b.zip}`
}

function labelBadgeVariant(
  label: RankedBuilding["label"]
): React.ComponentProps<typeof Badge>["variant"] {
  if (label === "High") return "default"
  if (label === "Medium") return "secondary"
  return "outline"
}

/**
 * Percentile-bar fill color, keyed off the ranking's opportunity label:
 *   High   → emerald-600  (strongest opportunity)
 *   Medium → emerald-300
 *   Low    → gray-300
 * A null label (check-data rows) renders no fill (0-width), handled at the call
 * site. electricResistanceWin rows are forced-High, so they land on emerald-600.
 */
function labelBarColor(label: RankedBuilding["label"]): string {
  if (label === "High") return "bg-emerald-600"
  if (label === "Medium") return "bg-emerald-300"
  return "bg-gray-300"
}

/**
 * The opportunity message for a ranked row, read entirely off the ranking's
 * flags (no threshold is recomputed here):
 * - the all-electric High override surfaces "likely electric resistance,
 *   biggest heat pump win" (Req 8.8) via `b.electricResistanceWin`;
 * - otherwise a mostly-gas, pre-1980 building surfaces "convert at boiler
 *   replacement" (Req 8.9).
 * Check-data rows (null label) carry neither message.
 */
function opportunityMessage(b: RankedBuilding): string | null {
  if (b.electricResistanceWin) {
    return "likely electric resistance, biggest heat pump win"
  }
  if (b.gasShare !== null && b.gasShare >= 0.8 && b.yearBuilt <= 1980) {
    return "convert at boiler replacement"
  }
  return null
}

export function BuildingsTable({
  buildings,
  selectedZip,
  onZipChange,
  className,
}: BuildingsTableProps) {
  // The full ranked cohort (no zip filter). This is the single source of truth
  // for the summary strip, the zip list, and the citywide top-25 — every number
  // below describes the SAME rows the table ranks (cohort-only, deduped).
  const rankedAll = React.useMemo(
    () => rankBuildings(buildings, null),
    [buildings]
  )

  // Zips present in the ranked COHORT (not all buildings), so picking a zip can
  // never yield an all-non-cohort empty set. Derived from the cohort rows.
  const zips = React.useMemo(
    () => Array.from(new Set(rankedAll.map((b) => b.zip))),
    [rankedAll]
  )

  // Rows to display: when a zip is set, re-rank with that zip (all matches, no
  // cap); otherwise the top 25 of the ranked cohort citywide. Either way the
  // order comes straight from rankBuildings (valid first, check-data last).
  const ranked = React.useMemo(
    () =>
      selectedZip === null
        ? rankedAll
        : rankBuildings(buildings, selectedZip),
    [buildings, rankedAll, selectedZip]
  )

  // The VALID cohort that the summary strip describes: the SELECTED zip's valid
  // rows when a zip is chosen, else the full citywide cohort. Either way, valid
  // = cohort rows with checkData === false (check-data rows are excluded).
  const summaryCohort = React.useMemo(
    () => ranked.filter((b) => !b.checkData),
    [ranked]
  )

  // Summary strip — computed from the summary cohort at render time, never
  // hardcoded (total multifamily, all-electric, >=50% gas, median site EUI).
  // Recomputes for the selected zip (FIX 8).
  const summary = React.useMemo(() => {
    const total = summaryCohort.length
    const allElectric = summaryCohort.filter(
      (b) => b.electricShare === 1
    ).length
    const mostlyGas = summaryCohort.filter(
      (b) => b.gasShare !== null && b.gasShare >= 0.5
    ).length
    const medianEUI = median(summaryCohort.map((b) => b.siteEUI))
    return { total, allElectric, mostlyGas, medianEUI }
  }, [summaryCohort])
  const rows =
    selectedZip === null ? ranked.slice(0, DEFAULT_CITYWIDE_LIMIT) : ranked

  const noMatch = selectedZip !== null && rows.length === 0

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Header: title + zip picker. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Boston multifamily buildings</h2>
          <p className="text-sm text-muted-foreground">
            Ranked by heat pump opportunity.
          </p>
        </div>
        <ZipPicker
          zips={zips}
          selectedZip={selectedZip}
          onZipChange={onZipChange}
        />
      </div>

      {/* Summary strip — computed from the summary cohort (zip-scoped when a zip
          is selected, else citywide), never hardcoded. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium tabular-nums">
          {selectedZip === null ? "Citywide" : `in ${selectedZip}`}
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCell label="Multifamily buildings" value={intFmt.format(summary.total)} />
          <SummaryCell label="All-electric" value={intFmt.format(summary.allElectric)} />
          <SummaryCell label="≥50% gas" value={intFmt.format(summary.mostlyGas)} />
          <SummaryCell
            label="Median site EUI"
            value={
              summary.medianEUI === null
                ? "—"
                : eui1Fmt.format(summary.medianEUI)
            }
          />
        </div>
      </div>

      {/* Default-view note: top 25 citywide, pick a zip to filter. */}
      {selectedZip === null ? (
        <p className="text-sm text-muted-foreground">
          Showing top 25 across Boston — pick a zip to filter
        </p>
      ) : (
        <p className="text-sm text-muted-foreground tabular-nums">
          {rows.length} {rows.length === 1 ? "building" : "buildings"} in {selectedZip}
        </p>
      )}

      {/* Ranked table. */}
      <div className="overflow-x-auto rounded-2xl border shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3 text-right">
                Energy use per sq ft
                <InfoTip
                  term="siteEui"
                  label="Energy use per sq ft"
                  className="ml-1"
                />
              </th>
              <th className="px-4 py-3 text-right">
                Yearly emissions (tons CO₂)
                <InfoTip
                  term="ghgEmissions"
                  label="Yearly emissions"
                  className="ml-1"
                />
              </th>
              <th className="px-4 py-3 text-right">
                Electric
                <InfoTip
                  term="electricShare"
                  label="Electric share"
                  className="ml-1"
                />
              </th>
              <th className="px-4 py-3 text-right">
                Gas
                <InfoTip
                  term="gasShare"
                  label="Gas share"
                  className="ml-1"
                />
              </th>
              <th className="px-4 py-3">
                Opportunity
                <InfoTip
                  term="opportunityScore"
                  label="Opportunity"
                  className="ml-1"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {noMatch ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No buildings match this zip.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No building data available.
                </td>
              </tr>
            ) : (
              rows.map((b) => {
                const message = opportunityMessage(b)
                // Pick the glossary term for the opportunity message so each
                // message carries the right plain-English tip inline.
                const messageTerm = b.electricResistanceWin
                  ? ("likelyElectricResistance" as const)
                  : ("convertAtBoiler" as const)
                return (
                  <tr key={b.id} className="border-b last:border-b-0 align-top">
                    {/* Row identity (no address) + property type/year/area/zip. */}
                    <td className="px-4 py-3">
                      <div className="font-medium tabular-nums">{rowIdentity(b)}</div>
                      {message ? (
                        <div className="mt-1 text-xs text-emerald-700">
                          {message}
                          <InfoTip
                            term={messageTerm}
                            label={message}
                            className="ml-1"
                          />
                        </div>
                      ) : null}
                    </td>

                    {/* Site EUI with the "check data" flag (EUI > 300), read
                        from the ranking's `checkData` flag — not re-derived. */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 tabular-nums">
                        <span>
                          {eui1Fmt.format(b.siteEUI)}
                        </span>
                        {b.checkData ? (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="outline" className="h-5 text-amber-700">
                              check data
                            </Badge>
                            <InfoTip term="checkData" label="Check data" />
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {intFmt.format(Math.round(b.ghgEmissions))}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatShare(b.electricShare)}
                    </td>

                    {/* Gas share: null shows "unknown", not 0% (Req 8.5). When
                        electric + gas overshoot 100%, surface an amber "shares
                        don't add up" badge; the row stays ranked and visible. */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5">
                        {b.gasShare === null ? (
                          <span className="text-muted-foreground">unknown</span>
                        ) : (
                          <span>{formatShare(b.gasShare)}</span>
                        )}
                        {sharesInconsistent(b) ? (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="outline" className="h-5 text-amber-700">
                              shares don&apos;t add up
                            </Badge>
                            <InfoTip
                              term="sharesDontAddUp"
                              label="Shares don't add up"
                            />
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Percentile emerald bar + numeric percentile + label Badge,
                        read straight from the ranking. Check-data rows carry a
                        null percentile/label and render a 0-width bar and "—"
                        (they already sort last from rankBuildings). An
                        all-electric High override (electricResistanceWin) fills
                        the bar to 100% and reads "resistance" instead of the
                        numeric percentile — read off the ranking, not recomputed. */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              labelBarColor(b.label)
                            )}
                            style={{
                              width: b.electricResistanceWin
                                ? "100%"
                                : `${b.percentile === null ? 0 : Math.round(b.percentile)}%`,
                            }}
                          />
                        </div>
                        <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                          {b.electricResistanceWin
                            ? "resistance"
                            : b.percentile === null
                              ? "—"
                              : Math.round(b.percentile)}
                        </span>
                        <Badge variant={labelBadgeVariant(b.label)}>
                          {b.label ?? "—"}
                        </Badge>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Source line. */}
      <p className="text-xs text-muted-foreground">
        Data:{" "}
        <SourceLink label="City of Boston BERDO 2021" href={BERDO_SOURCE_URL} />
        <InfoTip term="berdo" label="BERDO 2021" className="ml-1" />
      </p>
    </div>
  )
}

/** One stat cell of the summary strip. */
function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-medium tabular-nums">{value}</div>
    </div>
  )
}
