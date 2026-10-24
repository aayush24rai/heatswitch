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
 * cost, with a break-even efficiency readout alongside the typical heat-pump
 * efficiency (the current COP assumption). Display only; never red.
 */
export interface CostChartCardProps {
  currentAnnualCost: number
  heatPumpAnnualCost: number
  /** COP at which the heat pump cost equals the current heating cost. */
  breakevenCOP: number
  /** The current COP assumption — shown as the "typical heat pump" reference. */
  typicalCOP: number
}

const CURRENT_COLOR = "var(--muted-foreground)"
const HEAT_PUMP_SAVINGS_COLOR = "var(--chart-2)"
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
  typicalCOP,
}: CostChartCardProps) {
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
      <CardContent className="flex flex-col gap-3">
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
              <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.15)]} />
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

        {/* Break-even efficiency + the typical heat-pump efficiency reference. */}
        <div className="flex flex-col gap-0.5">
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
            <span className="text-muted-foreground">
              {" · typical heat pump: "}
              <span className="font-medium tabular-nums text-foreground">
                {typicalCOP.toFixed(1)}
              </span>
            </span>
          </span>
          <SourceLink label="How break-even efficiency is calculated" />
        </div>
      </CardContent>
    </Card>
  )
}
