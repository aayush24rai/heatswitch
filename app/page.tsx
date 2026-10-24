"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * HeatSwitch single-page shell (task 1.5).
 *
 * Two tabs — "My home" (default) and "Buildings (landlords & city)" — laid out
 * per the design.md wireframe. Every card here is an empty placeholder with a
 * title only; real content arrives in later tasks (3–7). Layout, spacing, and
 * the responsive two-column → single-column stacking follow the design steering.
 */

/** Placeholder card: a titled shell with a one-line note of what lands later. */
function PlaceholderCard({
  title,
  note,
  className,
}: {
  title: string
  note: string
  className?: string
}) {
  return (
    <Card className={`rounded-2xl p-6 shadow-sm ${className ?? ""}`}>
      <CardHeader className="p-0">
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 text-sm text-muted-foreground">
        {note}
      </CardContent>
    </Card>
  )
}

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">HeatSwitch</h1>
          <p className="text-sm text-muted-foreground">Know before you switch</p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          Massachusetts
        </Badge>
      </header>

      {/* Two-tab shell: "My home" is the default/active tab on load. */}
      <Tabs defaultValue="my-home">
        <TabsList className="mb-6">
          <TabsTrigger value="my-home">My home</TabsTrigger>
          <TabsTrigger value="buildings">
            Buildings (landlords &amp; city)
          </TabsTrigger>
        </TabsList>

        {/* TAB 1 — My home */}
        <TabsContent value="my-home" className="flex flex-col gap-6">
          {/* Upload card (full width) */}
          <PlaceholderCard
            title="Upload your bill"
            note="Drop a bill photo/PDF, enter your zip, toggle heat-included-in-rent, or try a demo home. (Task 3.2)"
          />

          {/* Left col 60% / right col 40% on desktop; single column below 768px. */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
            {/* Left column: Verdict + Cost chart */}
            <div className="flex flex-col gap-6 md:col-span-3">
              <PlaceholderCard
                title="Verdict"
                note="Switch now / Switch when your system needs replacing / Not worth it yet, big annual number, and the plain-English explanation. (Task 3.3)"
              />
              <PlaceholderCard
                title="Cost comparison"
                note="Current heating cost vs heat pump cost, plus breakeven COP. (Task 3.3)"
              />
            </div>

            {/* Right column: Your numbers + Assumptions + Rebates */}
            <div className="flex flex-col gap-6 md:col-span-2">
              <PlaceholderCard
                title="Your numbers"
                note="Editable fields with the bill text beneath each; amber fields need a quick check. (Task 3.4)"
              />
              <PlaceholderCard
                title="Assumptions"
                note="Sliders for COP, electricity price, fuel price, and the seasonal heat pump rate switch. (Task 4.1)"
              />
              <PlaceholderCard
                title="Rebates"
                note="Mass Save rebate, net install cost, payback, requirements, and the renter/landlord path. (Task 4.2)"
              />
            </div>
          </div>

          {/* Next step row */}
          <PlaceholderCard
            title="Next step"
            note="Free Boston Energy Saver consultation (Boston zips) or Mass Save Home Energy Assessment elsewhere. (Task 4.3)"
          />

          {/* How we calculate (collapsible later) */}
          <PlaceholderCard
            title="How we calculate"
            note="Formulas, assumptions, and sources — collapsed by default. (Task 4.4)"
          />
        </TabsContent>

        {/* TAB 2 — Buildings (landlords & city) */}
        <TabsContent value="buildings" className="flex flex-col gap-6">
          <PlaceholderCard
            title="Buildings (landlords &amp; city)"
            note="Zip picker and a ranked table of Boston multifamily buildings by heat pump opportunity, from the City of Boston BERDO 2021 dataset. (Task 5.2)"
          />
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <footer className="mt-10 border-t pt-6 text-sm text-muted-foreground">
        Your bill is never stored.
      </footer>
    </div>
  )
}
