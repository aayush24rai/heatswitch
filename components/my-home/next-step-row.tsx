"use client"

import { cn } from "cn"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { isBostonZip, isEquityZip } from "@/lib/rebates"

/**
 * NextStepRow — the location-based next step (Requirements 10.1–10.6).
 *
 * This card DISPLAYS a next step chosen purely from the zip; it computes no
 * number and never changes a rebate amount.
 *
 *  - Invalid zip (not /^\d{5}$/)       → suppress all location steps; prompt for
 *                                         a valid 5-digit zip (Req 10.5).
 *  - Boston zip                         → Boston Energy Saver consultation (Req 10.1).
 *  - Any other valid zip (incl. unknown
 *    MA zips)                           → Mass Save Home Energy Assessment (Req 10.2, 10.6).
 *  - Equity zip                         → ALSO an informational enhanced-incentive
 *                                         notice, visually distinct from any dollar
 *                                         figure (an Alert, not a $ amount), that
 *                                         does NOT imply a changed rebate (Req 10.3, 10.4).
 */

const ZIP_PATTERN = /^\d{5}$/

const BOSTON_ENERGY_SAVER_URL =
  "https://www.boston.gov/departments/environment"
const MASS_SAVE_ASSESSMENT_URL = "https://www.masssave.com/"

export interface NextStepRowProps {
  zip: string
}

export function NextStepRow({ zip }: NextStepRowProps) {
  const validZip = ZIP_PATTERN.test(zip)
  const boston = validZip && isBostonZip(zip)
  const equity = validZip && isEquityZip(zip)

  return (
    <Card className="rounded-2xl p-6 shadow-sm">
      <CardHeader className="p-0">
        <CardTitle className="text-lg font-medium">Next step</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-0 pt-4">
        {!validZip ? (
          // Req 10.5: suppress location steps until there's a valid 5-digit zip.
          <p className="text-sm text-muted-foreground">
            Enter a valid 5-digit zip code to see the right next step for your
            location.
          </p>
        ) : boston ? (
          // Req 10.1: Boston Energy Saver consultation.
          <div className="flex flex-col gap-2">
            <span className="text-sm text-foreground">
              Your zip is served by Boston Energy Saver.
            </span>
            <a
              href={BOSTON_ENERGY_SAVER_URL}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(buttonVariants({ size: "sm" }), "self-start")}
            >
              Free Boston Energy Saver consultation
            </a>
          </div>
        ) : (
          // Req 10.2 / 10.6: Mass Save assessment (default, incl. unknown zips).
          <div className="flex flex-col gap-2">
            <span className="text-sm text-foreground">
              Book a Mass Save Home Energy Assessment to get started.
            </span>
            <a
              href={MASS_SAVE_ASSESSMENT_URL}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "self-start"
              )}
            >
              Mass Save Home Energy Assessment
            </a>
          </div>
        )}

        {/* Req 10.3 / 10.4: equity-zip INFORMATIONAL notice — an Alert, visually
            distinct from any dollar figure, that does not imply a changed rebate. */}
        {equity ? (
          <Alert>
            <AlertTitle>Enhanced incentives may be available</AlertTitle>
            <AlertDescription>
              Your neighborhood is an equity-focus area, so extra Mass Save
              outreach and support may apply. This is informational only and
              doesn&apos;t change the rebate amount shown above.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
