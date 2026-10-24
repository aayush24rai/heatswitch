"use client"

import * as React from "react"
import { cn } from "cn"
import type { BerdoBuilding } from "@/lib/schema"
import {
  rankBuildings,
  sharesInconsistent,
  buildingAdvice,
  heatingFuelLabel,
  type RankedBuilding,
} from "@/lib/calc"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SourceLink } from "@/components/shared/source-link"
import { InfoTip } from "@/components/shared/info-tip"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ZipPicker } from "@/components/buildings/zip-picker"
import { neighborhoodFor, zipLabel } from "@/lib/neighborhoods"

/**
 * BuildingsTable — the Buildings tab, redesigned for non-experts (presentation
 * only; the cohort filter / dedupe / fossil-intensity score / percentiles /
 * labels / check-data split ALL still live in `rankBuildings`). The table reads
 * the per-row flags off each `RankedBuilding` and never re-derives the ranking.
 */

export interface BuildingsTableProps {
  buildings: BerdoBuilding[]
  selectedZip: string | null
  onZipChange: (zip: string | null) => void
  className?: string
}

/** Citywide default shows the top 10 with a "Show more" button. */
const DEFAULT_CITYWIDE_LIMIT = 10

const BERDO_SOURCE_URL =
  "https://data.boston.gov/dataset/building-energy-reporting-and-disclosure-ordinance"

const intFmt = new Intl.NumberFormat("en-US")
const eui1Fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function formatShare(share: number | null): string {
  if (share === null) return "—"
  return `${Math.round(share * 100)}%`
}

/** "Built 1920 · 24,700 sq ft · Allston (02134)" — no "Multifamily Housing". */
function buildingTitle(b: BerdoBuilding): string {
  const nb = neighborhoodFor(b.zip)
  const where = nb ? `${nb} (${b.zip})` : b.zip
  return `Built ${b.yearBuilt} · ${intFmt.format(
    Math.round(b.grossFloorAreaSqFt)
  )} sq ft · ${where}`
}

function labelBadgeVariant(
  label: RankedBuilding["label"]
): React.ComponentProps<typeof Badge>["variant"] {
  if (label === "High") return "default"
  if (label === "Medium") return "secondary"
  return "outline"
}

/** Bar fill color by priority label (tier colors, as before). */
function labelBarColor(label: RankedBuilding["label"]): string {
  if (label === "High") return "bg-emerald-600"
  if (label === "Medium") return "bg-emerald-300"
  return "bg-gray-300"
}

/** A small amber ⚠ with a tooltip, used for check-data / shares-don't-add-up. */
function WarnIcon({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={text}
          className="inline-flex size-4 cursor-help items-center justify-center rounded-full text-amber-600 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          ⚠
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function BuildingsTable({
  buildings,
  selectedZip,
  onZipChange,
  className,
}: BuildingsTableProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = React.useState(false)

  // Reset the "show more" expansion whenever the zip changes.
  React.useEffect(() => {
    setShowAll(false)
  }, [selectedZip])

  const rankedAll = React.useMemo(
    () => rankBuildings(buildings, null),
    [buildings]
  )
  const zips = React.useMemo(
    () => Array.from(new Set(rankedAll.map((b) => b.zip))),
    [rankedAll]
  )
  const ranked = React.useMemo(
    () =>
      selectedZip === null ? rankedAll : rankBuildings(buildings, selectedZip),
    [buildings, rankedAll, selectedZip]
  )

  // Valid cohort of the CURRENT view (zip-scoped or citywide) for the summary +
  // the "typical" (median) energy-use reference used by the "N× typical" column.
  const summaryCohort = React.useMemo(
    () => ranked.filter((b) => !b.checkData),
    [ranked]
  )
  const summary = React.useMemo(() => {
    const total = summaryCohort.length
    const allElectric = summaryCohort.filter((b) => b.electricShare === 1).length
    const mostlyGas = summaryCohort.filter(
      (b) => b.gasShare !== null && b.gasShare >= 0.5
    ).length
    const medianEUI = median(summaryCohort.map((b) => b.siteEUI))
    return { total, allElectric, mostlyGas, medianEUI }
  }, [summaryCohort])
  const typicalEUI = summary.medianEUI

  const scopeLabel =
    selectedZip === null ? "Citywide" : `in ${zipLabel(selectedZip)}`

  // Display rows: citywide shows the top 10 unless "Show more" is on; a zip
  // shows all its matches. Order comes straight from rankBuildings.
  const rows =
    selectedZip === null && !showAll
      ? ranked.slice(0, DEFAULT_CITYWIDE_LIMIT)
      : ranked
  const hiddenCount =
    selectedZip === null ? Math.max(0, ranked.length - rows.length) : 0

  const noMatch = selectedZip !== null && ranked.length === 0

  function toggle(id: string) {
    setExpanded((m) => ({ ...m, [id]: !m[id] }))
  }

  /** "N× typical" for a row given the cohort median. */
  function euiMultipleText(siteEUI: number): string {
    if (!typicalEUI || typicalEUI <= 0) return "—"
    return `${(siteEUI / typicalEUI).toFixed(1)}× typical`
  }
  function euiBarWidth(siteEUI: number): string {
    if (!typicalEUI || typicalEUI <= 0) return "0%"
    // Scale so "2× typical" roughly fills the bar; clamp 0–100%.
    const pct = Math.min(100, Math.max(0, (siteEUI / typicalEUI / 2) * 100))
    return `${Math.round(pct)}%`
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Header: title + intro + zip picker. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-medium">Boston apartment buildings</h2>
          <p className="text-sm text-muted-foreground">
            Apartment buildings that report their energy use to the City of
            Boston, ranked by where switching to a heat pump would cut the most
            fossil-fuel heating.
          </p>
        </div>
        <ZipPicker
          zips={zips}
          selectedZip={selectedZip}
          onZipChange={onZipChange}
        />
      </div>

      {/* Summary cards in plain words (zip-scoped or citywide). */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{scopeLabel}</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard>
            <strong className="tabular-nums">{intFmt.format(summary.total)}</strong>{" "}
            apartment buildings report to the city
          </SummaryCard>
          <SummaryCard>
            <strong className="tabular-nums">
              {intFmt.format(summary.mostlyGas)}
            </strong>{" "}
            heat mostly with gas
            <InfoTip term="heatingFuel" label="Heating fuel" className="ml-1" />
          </SummaryCard>
          <SummaryCard>
            <strong className="tabular-nums">
              {intFmt.format(summary.allElectric)}
            </strong>{" "}
            are already all-electric
          </SummaryCard>
          <SummaryCard>
            Typical energy use:{" "}
            <strong className="tabular-nums">
              {typicalEUI === null ? "—" : Math.round(typicalEUI)}
            </strong>{" "}
            kBtu per sq ft
            <InfoTip term="kbtuPerSqFt" label="kBtu per sq ft" className="ml-1" />
          </SummaryCard>
        </div>
      </div>

      {noMatch ? (
        <p className="text-sm text-muted-foreground">
          No buildings match this zip.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No building data available.
        </p>
      ) : (
        <>
          {/* ===== Desktop table (md+). ===== */}
          <div className="hidden overflow-x-auto rounded-2xl border shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Building</th>
                  <th className="px-4 py-3">
                    Energy use
                    <InfoTip term="energyUse" label="Energy use" className="ml-1" />
                  </th>
                  <th className="px-4 py-3">
                    Heating fuel
                    <InfoTip term="heatingFuel" label="Heating fuel" className="ml-1" />
                  </th>
                  <th className="px-4 py-3">What to do</th>
                  <th className="px-4 py-3">
                    Priority
                    <InfoTip term="priority" label="Priority" className="ml-1" />
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const isOpen = !!expanded[b.id]
                  return (
                    <React.Fragment key={b.id}>
                      <tr className="border-b last:border-b-0 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium tabular-nums">
                            {buildingTitle(b)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  labelBarColor(b.label)
                                )}
                                style={{ width: euiBarWidth(b.siteEUI) }}
                              />
                            </div>
                            <span className="tabular-nums">
                              {euiMultipleText(b.siteEUI)}
                            </span>
                            {b.checkData ? (
                              <WarnIcon text="This building's reported energy use looks unusually high — double-check it." />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1">
                            {heatingFuelLabel(b)}
                            {sharesInconsistent(b) ? (
                              <WarnIcon text="The electric and gas shares reported add up to more than 100%, so the fuel mix may be off." />
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-3">{buildingAdvice(b)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={labelBadgeVariant(b.label)}>
                            {b.label ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            aria-expanded={isOpen}
                            onClick={() => toggle(b.id)}
                          >
                            Details {isOpen ? "▴" : "▾"}
                          </Button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={6} className="px-4 py-3">
                            <DetailGrid b={b} />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ===== Mobile stacked cards (<md). ===== */}
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((b) => {
              const isOpen = !!expanded[b.id]
              return (
                <div
                  key={b.id}
                  className="flex flex-col gap-2 rounded-2xl border p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium tabular-nums">
                      {buildingTitle(b)}
                    </span>
                    <Badge variant={labelBadgeVariant(b.label)}>
                      {b.label ?? "—"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Energy use:</span>
                    <span className="tabular-nums">{euiMultipleText(b.siteEUI)}</span>
                    {b.checkData ? (
                      <WarnIcon text="This building's reported energy use looks unusually high — double-check it." />
                    ) : null}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Heating fuel: </span>
                    <span className="inline-flex items-center gap-1">
                      {heatingFuelLabel(b)}
                      {sharesInconsistent(b) ? (
                        <WarnIcon text="The electric and gas shares reported add up to more than 100%, so the fuel mix may be off." />
                      ) : null}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">What to do: </span>
                    {buildingAdvice(b)}
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="self-start"
                    aria-expanded={isOpen}
                    onClick={() => toggle(b.id)}
                  >
                    Details {isOpen ? "▴" : "▾"}
                  </Button>
                  {isOpen ? <DetailGrid b={b} /> : null}
                </div>
              )
            })}
          </div>

          {/* Citywide "Show more". */}
          {hiddenCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setShowAll(true)}
            >
              Show more ({intFmt.format(hiddenCount)} more)
            </Button>
          ) : null}
        </>
      )}

      {/* Source line. */}
      <p className="text-xs text-muted-foreground">
        Data:{" "}
        <SourceLink label="City of Boston BERDO 2021" href={BERDO_SOURCE_URL} />
        <InfoTip term="berdo" label="BERDO 2021" className="ml-1" />
      </p>
    </div>
  )
}

/** The expandable per-building details: raw site EUI, emissions, shares, score. */
function DetailGrid({ b }: { b: RankedBuilding }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
      <Detail label="Site EUI" value={`${eui1Fmt.format(b.siteEUI)} kBtu/ft²`} />
      <Detail
        label="Yearly emissions"
        value={`${intFmt.format(Math.round(b.ghgEmissions))} t CO₂`}
      />
      <Detail label="Electric share" value={formatShare(b.electricShare)} />
      <Detail label="Gas share" value={formatShare(b.gasShare)} />
      <Detail
        label="Opportunity score"
        value={b.score.toFixed(1)}
      />
    </dl>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

function SummaryCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 text-sm shadow-sm">{children}</div>
  )
}
