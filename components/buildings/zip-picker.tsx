"use client"

import * as React from "react"
import { cn } from "cn"
import { zipLabel } from "@/lib/neighborhoods"

/**
 * ZipPicker — the zip selector for the Buildings tab (Buildings_View).
 *
 * The picker lists ONLY the zips present in the data (the `zips` prop; task 5.3
 * passes the sorted unique zips derived from the cleaned BERDO JSON), plus an
 * "All of Boston" option that maps to `null` (no zip filter). Selecting an
 * option drives the ranked table filter (Requirement 8.10).
 *
 * It is a styled native `<select>` so it stays usable even when the dataset
 * fails to load (Requirements 8.2 / 8.11): the picker is purely presentational
 * over the `zips` it is given and never computes a number.
 */
export interface ZipPickerProps {
  /** The zips present in the data. Rendered sorted ascending. */
  zips: string[]
  /** The currently selected zip, or `null` for "All of Boston". */
  selectedZip: string | null
  /** Called with the chosen zip, or `null` for the all-zips option. */
  onZipChange: (zip: string | null) => void
  className?: string
}

/** Sentinel value used for the "All of Boston" <option> (maps to null). */
const ALL_ZIPS_VALUE = "__all__"

export function ZipPicker({
  zips,
  selectedZip,
  onZipChange,
  className,
}: ZipPickerProps) {
  // Only the zips present in the data, sorted ascending and de-duplicated so a
  // repeated zip never produces two identical options.
  const sortedZips = React.useMemo(
    () => Array.from(new Set(zips)).sort((a, b) => a.localeCompare(b)),
    [zips]
  )

  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">Zip code</span>
      <select
        aria-label="Filter buildings by zip code"
        value={selectedZip ?? ALL_ZIPS_VALUE}
        onChange={(e) => {
          const v = e.target.value
          onZipChange(v === ALL_ZIPS_VALUE ? null : v)
        }}
        className={cn(
          "h-9 w-full min-w-44 rounded-lg border border-border bg-background px-3 text-sm tabular-nums shadow-sm outline-none transition-colors",
          "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        )}
      >
        <option value={ALL_ZIPS_VALUE}>All of Boston</option>
        {sortedZips.map((zip) => (
          <option key={zip} value={zip}>
            {zipLabel(zip)}
          </option>
        ))}
      </select>
    </label>
  )
}
