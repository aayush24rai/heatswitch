"use client"

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SourceLink } from "@/components/shared/source-link"
import { InfoTip } from "@/components/shared/info-tip"

/**
 * CostChartCard — a two-bar comparison of current heating cost vs heat pump
 * cost, with a breakeven COP readout (Requirements 6.x cost presentation).
 *
 * Recharts renders in the browser, so this is a client component. Colors stay
 * neutral/emerald (the theme chart tokens); red is never used.
 */
export interface CostChartCardProps {
  /** $/yr with the current heating system. */
  currentAnnualCost: number
  /** $/yr with a heat pump (rate-aware). */
  heatPumpAnnualCost: number
  /** COP at which the heat pump cost equals the current heating cost. */
  breakevenCOP: number
}

/** Current heating uses a neutral muted token. The heat pump bar is colored by
 *  the comparison: emerald (the chart token) when it saves money, amber when it
 *  costs MORE to run than the current system. Never red. */
const CURRENT_COLOR = "var(--muted-foreground)"
const HEAT_PUMP_SAVINGS_COLOR = "var(--chart-2)"
/** amber-600 — matches the "extra cost" color used across the results UI. */
const HEAT_PUMP_COSTS_MORE_COLOR = "#d97706"

function formatDollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function CostChartCard({
  currentAnnualCost,
  heatPumpAnnualCost,
  breakevenCOP,
}: CostChartCardProps) {
  // Amber when the heat pump costs more to run than the current system,
  // emerald otherwise (never red).
  const heatPumpColor =
    heatPumpAnnualCost > currentAnnualCost
      ? HEAT_PUMP_COSTS_MORE_COLOR
      : HEAT_PUMP_SAVINGS_COLOR

  const data = [
    { name: "Current heating", cost: Math.round(currentAnnualCost), fill: CURRENT_COLOR },
    { name: "Heat pump", cost: Math.round(heatPumpAnnualCost), fill: heatPumpColor },
  ]

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Annual heating cost</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 24, right: 8, bottom: 0, left: 8 }}
            >
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                hide
                domain={[0, (max: number) => Math.ceil(max * 1.15)]}
              />
              <Bar dataKey="cost" radius={[8, 8, 0, 0]} maxBarSize={96}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
                <LabelList
                  dataKey="cost"
                  position="top"
                  className="fill-foreground tabular-nums"
                  fontSize={14}
                  formatter={(value) => formatDollars(Number(value))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground">
            Break-even efficiency:
            <InfoTip
              term="breakEvenEfficiency"
              label="Break-even efficiency"
              className="mx-1"
            />
            <span className="font-medium tabular-nums">
              {breakevenCOP.toFixed(2)}
            </span>
          </span>
          <SourceLink label="How break-even efficiency is calculated" />
        </div>
      </CardContent>
    </Card>
  )
}
