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

/** Current heating uses a neutral muted token; heat pump uses the emerald
 *  chart token — both read as "informational", never alarming (no red). */
const CURRENT_COLOR = "var(--muted-foreground)"
const HEAT_PUMP_COLOR = "var(--chart-2)"

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
  const data = [
    { name: "Current heating", cost: Math.round(currentAnnualCost), fill: CURRENT_COLOR },
    { name: "Heat pump", cost: Math.round(heatPumpAnnualCost), fill: HEAT_PUMP_COLOR },
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
            Breakeven COP:{" "}
            <span className="font-medium tabular-nums">
              {breakevenCOP.toFixed(2)}
            </span>
          </span>
          <SourceLink label="How breakeven COP is calculated" />
        </div>
      </CardContent>
    </Card>
  )
}
