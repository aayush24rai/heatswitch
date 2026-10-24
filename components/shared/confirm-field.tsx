"use client"

import * as React from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * ConfirmField — inline confirmation primitive.
 *
 * Shows the best-guess value immediately (Req 3.1). When unconfirmed, renders an
 * amber outline, the exact bill `evidence` as a monospace "quote chip" beneath
 * the value (Req 3.2, 11.2), and [Looks right] / [Edit] actions. Editing happens
 * in place — no modal, no new tab (Req 3.3). Edit mode has explicit Save and
 * Cancel buttons; Enter saves, Esc cancels. Committing validates the input is a
 * finite number within the optional range; invalid input keeps the field in edit
 * mode with the prior value preserved and shows an inline error (Req 3.11).
 *
 * Once the user has edited the value, the evidence chip is replaced with
 * "You entered {new} (bill said {original})" and the ORIGINAL bill evidence is
 * tucked into a tooltip on that chip, so the provenance is never lost.
 */
export interface ConfirmFieldProps {
  value: number
  unit: string
  evidence?: string
  confirmed: boolean
  onConfirm: () => void
  onEdit: (value: number) => void
  label?: string
  min?: number
  max?: number
}

/** Group a number with thousands separators for DISPLAY (e.g. 7600 → "7,600").
 *  Decimals preserved up to 3 places; the underlying value is untouched. */
function formatGrouped(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(value)
}

function buildRangeMessage(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) {
    return `Enter a number between ${min} and ${max}.`
  }
  if (min !== undefined) {
    return `Enter a number of at least ${min}.`
  }
  if (max !== undefined) {
    return `Enter a number of at most ${max}.`
  }
  return "Enter a valid number."
}

export function ConfirmField({
  value,
  unit,
  evidence,
  confirmed,
  onConfirm,
  onEdit,
  label,
  min,
  max,
}: ConfirmFieldProps) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(String(value))
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // The ORIGINAL (bill-extracted) value + evidence — captured once on mount so
  // an edit can show "You entered X (bill said Y)" and keep the original quote.
  const originalValueRef = React.useRef(value)
  const originalEvidenceRef = React.useRef(evidence)
  // True once the user has committed an edit to this field.
  const [edited, setEdited] = React.useState(false)

  // Keep the draft in sync with the external value whenever not actively editing.
  React.useEffect(() => {
    if (!editing) {
      setDraft(String(value))
    }
  }, [value, editing])

  function startEditing() {
    setDraft(String(value))
    setError(null)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function cancelEditing() {
    setEditing(false)
    setError(null)
    setDraft(String(value))
  }

  function commitEditing() {
    const parsed = Number(draft.trim().replace(/,/g, ""))
    const valid =
      draft.trim() !== "" &&
      Number.isFinite(parsed) &&
      (min === undefined || parsed >= min) &&
      (max === undefined || parsed <= max)

    if (!valid) {
      // Req 3.11: reject, stay in edit mode, keep the prior value, show error.
      setError(buildRangeMessage(min, max))
      setDraft(String(value))
      requestAnimationFrame(() => inputRef.current?.focus())
      return
    }

    setError(null)
    setEditing(false)
    if (parsed !== originalValueRef.current) setEdited(true)
    onEdit(parsed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitEditing()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancelEditing()
    }
  }

  const showAmber = !confirmed
  const errorId = React.useId()

  return (
    <div
      data-slot="confirm-field"
      data-confirmed={confirmed}
      className={cn(
        "flex flex-col gap-2 rounded-lg p-3 transition-colors",
        showAmber
          ? "border border-amber-500 ring-1 ring-amber-500/40 bg-amber-50/40"
          : "border border-border"
      )}
    >
      {label ? (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              value={draft}
              aria-label={label ?? "value"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className={cn(
                "h-8 w-28 rounded-md border bg-background px-2 text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                error
                  ? "border-destructive focus-visible:ring-destructive/30"
                  : "border-input focus-visible:border-ring"
              )}
            />
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {/* Save / Cancel (Enter = Save, Esc = Cancel). */}
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" size="sm" variant="default" onClick={commitEditing}>
              Save
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancelEditing}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">
            {formatGrouped(value)}
          </span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      )}

      {/* Evidence chip. Once edited, show "You entered X (bill said Y)" and keep
          the ORIGINAL bill text in a tooltip; otherwise show the bill evidence. */}
      {edited ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              type="button"
              className="w-fit max-w-full cursor-help truncate rounded-md bg-muted px-2 py-0.5 text-left font-mono text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              You entered {formatGrouped(value)} (bill said{" "}
              {formatGrouped(originalValueRef.current)})
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {originalEvidenceRef.current
                ? `Bill: “${originalEvidenceRef.current}”`
                : "No bill evidence for this field."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : evidence ? (
        <span className="w-fit max-w-full truncate rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          &ldquo;{evidence}&rdquo;
        </span>
      ) : null}

      {showAmber && !editing ? (
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" size="sm" variant="default" onClick={onConfirm}>
            Looks right
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={startEditing}>
            Edit
          </Button>
        </div>
      ) : null}
    </div>
  )
}
