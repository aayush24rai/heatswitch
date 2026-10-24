"use client"

import * as React from "react"
import { cn } from "cn"
import type { Assumptions, HeatingType } from "@/lib/schema"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { SourceLink } from "@/components/shared/source-link"

/**
 * AssumptionsCard — the user-adjustable knobs on the My home tab (Requirements
 * 4.11, 4.12, 4.13). It DISPLAYS the current Assumptions and emits change
 * callbacks; it computes NO number. The page re-runs the pure engine
 * (computeComparison / computeRebates / decideVerdict) via a useMemo whenever
 * these callbacks mutate the shared Assumptions, so results recompute live.
 *
 * Three sliders and one switch, all shadcn/ui:
 *  - Heat pump COP            1.5 – 4.5  step 0.1   → onChangeCOP
 *  - Electricity price $/kWh  0.10 – 0.50 step 0.001 → onChangeElectricityPrice
 *  - Fuel price (native unit) range depends on heating type → onChangeFuelPrice
 *  - Seasonal heat pump rate  Switch → onToggleSeasonalRate
 *
 * The fuel-price slider is NOT part of Assumptions — it drives the home's
 * `fuelUnitPrice` on HomeInputs — so its current value is passed in as
 * `fuelUnitPrice` and its unit label is derived from `heatingType`.
 */

export interface AssumptionsCardProps {
  assumptions: Assumptions
  /** Current fuel unit price from HomeInputs ($/therm, $/gallon, or $/kWh). */
  fuelUnitPrice: number
  /** Heating type drives the fuel-price slider's unit label + range. */
  heatingType: HeatingType
  onChangeCOP: (cop: number) => void
  onChangeElectricityPrice: (price: number) => void
  onChangeFuelPrice: (price: number) => void
  onToggleSeasonalRate: (on: boolean) => void
}

/** Per-heating-type fuel-price slider config (unit label + reasonable range). */
const FUEL_PRICE_CONFIG: Record<
  HeatingType,
  { unit: string; min: number; max: number; step: number }
> = {
  gas: { unit: "$/therm", min: 0.5, max: 5, step: 0.01 },
  oil: { unit: "$/gallon", min: 1, max: 12, step: 0.01 },
  propane: { unit: "$/gallon", min: 1, max: 12, step: 0.01 },
  "electric-resistance": { unit: "$/kWh", min: 0.1, max: 0.6, step: 0.001 },
}

/** Pull the single value out of a base-ui Slider onValueChange payload. */
function readSliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0] : (value as number)
}

/** A labeled slider row with its current value and an optional source beneath. */
function SliderRow({
  label,
  valueText,
  value,
  min,
  max,
  step,
  ariaLabel,
  onChange,
  source,
}: {
  label: string
  valueText: string
  value: number
  min: number
  max: number
  step: number
  ariaLabel: string
  onChange: (next: number) => void
  source?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">{valueText}</span>
      </div>
      <Slider
        aria-label={ariaLabel}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(readSliderValue(next))}
      />
      {source ? <div>{source}</div> : null}
    </div>
  )
}

export function AssumptionsCard({
  assumptions,
  fuelUnitPrice,
  heatingType,
  onChangeCOP,
  onChangeElectricityPrice,
  onChangeFuelPrice,
  onToggleSeasonalRate,
}: AssumptionsCardProps) {
  const fuel = FUEL_PRICE_CONFIG[heatingType]

  return (
    <Card className="rounded-2xl p-6 shadow-sm">
      <CardHeader className="p-0">
        <CardTitle className="text-lg font-medium">Assumptions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-0 pt-4">
        {/* Heat pump COP (Req 4.13). */}
        <SliderRow
          label="Heat pump COP"
          valueText={assumptions.heatPumpCOP.toFixed(1)}
          value={assumptions.heatPumpCOP}
          min={1.5}
          max={4.5}
          step={0.1}
          ariaLabel="Heat pump coefficient of performance"
          onChange={onChangeCOP}
          source={
            <SourceLink
              label="NEEP — cold-climate heat pump list"
              href="https://ashp.neep.org/"
            />
          }
        />

        {/* Electricity price $/kWh. */}
        <SliderRow
          label="Electricity price"
          valueText={`$${assumptions.electricityPrice.toFixed(3)}/kWh`}
          value={assumptions.electricityPrice}
          min={0.1}
          max={0.5}
          step={0.001}
          ariaLabel="Electricity price in dollars per kWh"
          onChange={onChangeElectricityPrice}
          source={
            <SourceLink
              label="EIA — Massachusetts residential average price"
              href="https://www.eia.gov/electricity/monthly/epm_table_grapher.php"
            />
          }
        />

        {/* Fuel price in the heating type's native unit. */}
        <SliderRow
          label="Fuel price"
          valueText={`$${fuelUnitPrice.toFixed(
            fuel.step < 0.01 ? 3 : 2
          )} ${fuel.unit}`}
          value={fuelUnitPrice}
          min={fuel.min}
          max={fuel.max}
          step={fuel.step}
          ariaLabel={`Fuel price in ${fuel.unit}`}
          onChange={onChangeFuelPrice}
        />

        {/* Seasonal heat pump rate switch (Req 4.11, 4.12). */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">
              Seasonal heat pump rate
            </span>
            <Switch
              aria-label="Massachusetts seasonal heat pump electric rate"
              checked={assumptions.seasonalHeatPumpRate}
              onCheckedChange={(checked) =>
                onToggleSeasonalRate(Boolean(checked))
              }
            />
          </div>
          <p
            className={cn(
              "text-xs text-muted-foreground",
              assumptions.seasonalHeatPumpRate && "text-emerald-600"
            )}
          >
            {assumptions.seasonalHeatPumpRate
              ? `On: −$${assumptions.seasonalRateDiscountPerKWh.toFixed(
                  3
                )}/kWh off the electricity price in heating months`
              : "Off: the seasonal discount is not applied"}
          </p>
          <SourceLink
            label="MA residential seasonal heat pump rates"
            href="https://www.mass.gov/info-details/residential-electric-seasonal-heat-pump-rates"
          />
        </div>
      </CardContent>
    </Card>
  )
}
