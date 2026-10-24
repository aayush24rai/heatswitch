"use client"

import * as React from "react"
import type { Assumptions } from "@/lib/schema"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SourceLink } from "@/components/shared/source-link"

/**
 * HowWeCalculate — a transparency section, collapsed by default, that expands to
 * show the formulas, the assumption values currently in effect, and sources
 * (Requirements 11.3, 11.5).
 *
 * The sanctioned shadcn set (Card, Button, Slider, Switch, Tabs, Badge, Alert,
 * Tooltip, Skeleton) has no Collapsible, so this uses an accessible Button
 * toggle (aria-expanded + aria-controls) with a conditionally rendered panel —
 * no new UI dependency, no custom CSS. It DISPLAYS values only.
 */

export interface HowWeCalculateProps {
  assumptions: Assumptions
}

/** A labeled constant/assumption row with a source link beneath. */
function SourceRow({
  label,
  value,
  sourceLabel,
  href,
}: {
  label: string
  value: string
  sourceLabel: string
  href: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">{value}</span>
      </div>
      <SourceLink label={sourceLabel} href={href} />
    </div>
  )
}

export function HowWeCalculate({ assumptions }: HowWeCalculateProps) {
  const [open, setOpen] = React.useState(false)
  const panelId = React.useId()

  return (
    <Card className="rounded-2xl p-6 shadow-sm">
      <CardHeader className="p-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg font-medium">
            How we calculate
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide details" : "Show details"}
          </Button>
        </div>
      </CardHeader>

      {open ? (
        <CardContent id={panelId} className="flex flex-col gap-6 p-0 pt-4">
          {/* Formulas. */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Formulas</span>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              <li>
                Current heating cost = annual fuel use × fuel unit price
              </li>
              <li>
                Heat pump cost = delivered heat energy ÷ COP × (electricity
                price − seasonal discount, floored at 0)
              </li>
              <li>
                Delivered heat energy = fuel use × energy content × system
                efficiency
              </li>
              <li>
                Breakeven COP = the COP at which heat pump cost equals current
                cost
              </li>
              <li>
                Net install cost = gross install cost − Mass Save rebate
              </li>
              <li>
                Payback = net install cost ÷ annual savings (none when savings ≤
                0)
              </li>
            </ul>
          </div>

          {/* Assumption values currently in effect. */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">
              Assumptions in effect
            </span>
            <SourceRow
              label="Heat pump COP"
              value={assumptions.heatPumpCOP.toFixed(1)}
              sourceLabel="MA seasonal heat pump rates"
              href="https://www.mass.gov/info-details/residential-electric-seasonal-heat-pump-rates"
            />
            <SourceRow
              label="Electricity price"
              value={`$${assumptions.electricityPrice.toFixed(3)}/kWh`}
              sourceLabel="MA seasonal heat pump rates"
              href="https://www.mass.gov/info-details/residential-electric-seasonal-heat-pump-rates"
            />
            <SourceRow
              label="Seasonal heat pump rate"
              value={
                assumptions.seasonalHeatPumpRate
                  ? `on (−$${assumptions.seasonalRateDiscountPerKWh.toFixed(
                      3
                    )}/kWh)`
                  : "off"
              }
              sourceLabel="MA seasonal heat pump rates"
              href="https://www.mass.gov/info-details/residential-electric-seasonal-heat-pump-rates"
            />
            <SourceRow
              label="Heat pump capacity"
              value={`${assumptions.heatPumpTons} tons`}
              sourceLabel="Mass Save rebates"
              href="https://www.masssave.com/"
            />
            <SourceRow
              label="Gross install cost"
              value={new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }).format(assumptions.installCostGross)}
              sourceLabel="Mass Save rebates"
              href="https://www.masssave.com/"
            />
          </div>

          {/* Sources. */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Sources</span>
            <div className="flex flex-col gap-1">
              <SourceLink
                label="Fuel energy content — U.S. EIA"
                href="https://www.eia.gov/energyexplained/units-and-calculators/"
              />
              <SourceLink
                label="System efficiency — U.S. DOE"
                href="https://www.energy.gov/energysaver/furnaces-and-boilers"
              />
              <SourceLink
                label="Seasonal heat pump rates — Mass.gov"
                href="https://www.mass.gov/info-details/residential-electric-seasonal-heat-pump-rates"
              />
              <SourceLink
                label="Rebates & income limits — Mass Save"
                href="https://www.masssave.com/"
              />
            </div>
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
