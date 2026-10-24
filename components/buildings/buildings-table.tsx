"use client"

import * as React from "react"
import { cn } from "cn"
import type { BerdoBuilding } from "@/lib/schema"
import {
  rankBuildings,
  sharesInconsistent,
  heatingFuelLabel,
  adviceChip,
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
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary"
import { ZipPicker } from "@/components/buildings/zip-picker"
import { neighborhoodFor, zipLabel } from "@/lib/neighborhoods"

/**
 * BuildingsTable — the Buildings tab, tightened for scannability (presentation
 * only; the ranking still lives entirely in `rankBuildings`). Max 5 columns:
 * Building · Energy use (bar + "N× typical") · Heating fuel · What to do (chip)
 * · Priority (badge, right-aligned). Rows don't wrap on desktop; the whole row
 * is clickable to expand Details. Mobile (<md) renders stacked cards.
 */

export interface BuildingsTableProps {
  buildings: BerdoBuilding[]
  selectedZip: string | null
  onZipChange: (zip: string | null) => void
  className?: string
}

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

/** Building cell line 1: "Allston · built 1916" (neighborhood when known). */
function buildingLine1(b: BerdoBuilding): string {
  const nb = neighborhoodFor(b.zip)
  return nb ? `${nb} · built ${b.yearBuilt}` : `Built ${b.yearBuilt}`
}
/** Building cell line 2: "43,803 sq ft · 02134". */
function buildingLine2(b: BerdoBuilding): string {
  return `${intFmt.format(Math.round(b.grossFloorAreaSqFt))} sq ft · ${b.zip}`
}

function labelBadgeVariant(
  label: RankedBuilding["label"]
): React.ComponentProps<typeof Badge>["variant"] {
  if (label === "High") return "default"
  if (label === "Medium") return "secondary"
  return "outline"
}

function labelBarColor(label: RankedBuilding["label"]): string {
  if (label === "High") return "bg-emerald-600"
  if (label === "Medium") return "bg-emerald-300"
  return "bg-gray-300"
}

/** Column header text that is itself a tooltip trigger — no visible "?" icon.
 *  Keyboard-focusable; shows the glossary definition on hover/focus. */
function HeaderTip({
  term,
  children,
}: {
  term: GlossaryKey
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className="cursor-help text-xs font-medium text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{GLOSSARY[term]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** A small amber ⚠ with a tooltip (check-data / shares-don't-add-up). */
function WarnIcon({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={text}
          className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-amber-600 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          ⚠
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const CHECK_DATA_WARN =
  "This building's reported energy use looks unusually high — double-check it."
const SHARES_WARN =
  "The electric and gas shares reported add up to more than 100%, so the fuel mix may be off."

/** The "what to do" chip: emerald tint for High actions, neutral otherwise; the
 *  full sentence lives in the tooltip. */
function AdviceChipView({ b }: { b: RankedBuilding }) {
  const chip = adviceChip(b)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className={cn(
            "inline-flex cursor-help items-center rounded-full px-2.5 py-0.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            chip.high
              ? "bg-emerald-100 text-emerald-800"
              : "bg-muted text-muted-foreground"
          )}
        >
          {chip.label}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{chip.sentence}</TooltipContent>
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
  function euiMultiple(siteEUI: number): string {
    if (!typicalEUI || typicalEUI <= 0) return "—"
    return `${(siteEUI / typicalEUI).toFixed(1)}×`
  }
  function euiBarWidth(siteEUI: number): string {
    if (!typicalEUI || typicalEUI <= 0) return "0%"
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

      {/* Summary cards in plain words. */}
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
          <div className="hidden overflow-hidden rounded-2xl border shadow-sm md:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-4 py-3 font-medium">
                    <span className="text-xs font-medium text-muted-foreground">
                      Building
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <HeaderTip term="energyUse">Energy use</HeaderTip>
                  </th>
                  <th className="px-4 py-3">
                    <HeaderTip term="heatingFuel">Heating fuel</HeaderTip>
                  </th>
                  <th className="px-4 py-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      What to do
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <HeaderTip term="priority">Priority</HeaderTip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const isOpen = !!expanded[b.id]
                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-expanded={isOpen}
                        onClick={() => toggle(b.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            toggle(b.id)
                          }
                        }}
                        className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/50"
                      >
                        {/* Building: two lines, no wrap. */}
                        <td className="px-4 py-3 align-middle">
                          <div className="truncate text-sm font-medium">
                            {buildingLine1(b)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground tabular-nums">
                            {buildingLine2(b)}
                          </div>
                        </td>

                        {/* Energy use: bar + single right-aligned multiple. */}
                        <td className="px-4 py-3 text-right align-middle">
                          <div className="flex items-center justify-end gap-2">
                            {b.checkData ? <WarnIcon text={CHECK_DATA_WARN} /> : null}
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  labelBarColor(b.label)
                                )}
                                style={{ width: euiBarWidth(b.siteEUI) }}
                              />
                            </div>
                            <span className="w-10 text-right tabular-nums">
                              {euiMultiple(b.siteEUI)}
                            </span>
                          </div>
                        </td>

                        {/* Heating fuel. */}
                        <td className="px-4 py-3 align-middle">
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            {heatingFuelLabel(b)}
                            {sharesInconsistent(b) ? (
                              <WarnIcon text={SHARES_WARN} />
                            ) : null}
                          </span>
                        </td>

                        {/* What to do: single chip. */}
                        <td className="px-4 py-3 align-middle">
                          <AdviceChipView b={b} />
                        </td>

                        {/* Priority badge, right-aligned (last column). */}
                        <td className="px-4 py-3 text-right align-middle">
                          <Badge variant={labelBadgeVariant(b.label)}>
                            {b.label ?? "—"}
                          </Badge>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={5} className="px-4 py-3">
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
                    <div>
                      <div className="text-sm font-medium">{buildingLine1(b)}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {buildingLine2(b)}
                      </div>
                    </div>
                    <Badge variant={labelBadgeVariant(b.label)}>
                      {b.label ?? "—"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground">Energy use:</span>
                      <span className="tabular-nums">{euiMultiple(b.siteEUI)} typical</span>
                      {b.checkData ? <WarnIcon text={CHECK_DATA_WARN} /> : null}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground">Fuel:</span>
                      {heatingFuelLabel(b)}
                      {sharesInconsistent(b) ? <WarnIcon text={SHARES_WARN} /> : null}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <AdviceChipView b={b} />
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      aria-expanded={isOpen}
                      onClick={() => toggle(b.id)}
                    >
                      Details {isOpen ? "▴" : "▾"}
                    </Button>
                  </div>
                  {isOpen ? <DetailGrid b={b} /> : null}
                </div>
              )
            })}
          </div>

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

/** Expandable per-building details: raw site EUI, emissions, shares, score, and
 *  the full "what to do" sentence. */
function DetailGrid({ b }: { b: RankedBuilding }) {
  const chip = adviceChip(b)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{chip.sentence}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Detail label="Site EUI" value={`${eui1Fmt.format(b.siteEUI)} kBtu/ft²`} />
        <Detail
          label="Yearly emissions"
          value={`${intFmt.format(Math.round(b.ghgEmissions))} t CO₂`}
        />
        <Detail label="Electric share" value={formatShare(b.electricShare)} />
        <Detail label="Gas share" value={formatShare(b.gasShare)} />
        {b.electricResistanceWin ? (
          // The fossil-intensity score is 0 for an all-electric building, so
          // showing "0.0" misreads as "no opportunity". Explain the override.
          <div className="col-span-2 flex flex-col sm:col-span-4">
            <dt className="text-xs text-muted-foreground">Why High</dt>
            <dd>
              Ranked high: all-electric with high energy use, likely electric
              resistance heat
            </dd>
          </div>
        ) : (
          <Detail label="Opportunity score" value={b.score.toFixed(1)} />
        )}
      </dl>
    </div>
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
