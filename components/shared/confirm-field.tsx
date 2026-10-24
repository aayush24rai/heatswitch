"use client"

import * as React from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

/**
 * ConfirmField — inline confirmation primitive.
 *
 * Shows the best-guess value immediately (Req 3.1). When unconfirmed, renders an
 * amber outline, the exact bill `evidence` as a small monospace "quote chip"
 * beneath the value (Req 3.2, 11.2), and [Looks right] / [Edit] actions. Editing
 * happens in place — no modal, no new tab (Req 3.3). Committing an edit validates
 * the input is a finite number within the optional range; invalid input keeps the
 * field in edit mode with the prior value preserved and shows an inline error
 * (Req 3.11).
 */
export interface ConfirmFieldProps {
  /** Best-guess numeric value, shown immediately. */
  value: number
  /** Unit label displayed after the value, e.g. "therms". */
  unit: string
  /** Exact bill text this value came from; shown as a monospace quote chip. */
  evidence?: string
  /** false => amber outline + [Looks right]/[Edit]; true => confirmed state. */
  confirmed: boolean
  /** Called when the user accepts the best guess via "Looks right". */
  onConfirm: () => void
  /** Called with the committed, validated numeric value after an edit. */
  onEdit: (value: number) => void
  /** Optional field name shown above the value. */
  label?: string
  /** Optional inclusive lower bound used for edit validation. */
  min?: number
  /** Optional inclusive upper bound used for edit validation. */
  max?: number
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

  // Keep the draft in sync with the external value whenever we are not actively
  // editing (e.g. a parent recompute changed the value).
  React.useEffect(() => {
    if (!editing) {
      setDraft(String(value))
    }
  }, [value, editing])

  function startEditing() {
    setDraft(String(value))
    setError(null)
    setEditing(true)
    // Focus the input once it mounts.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function cancelEditing() {
    setEditing(false)
    setError(null)
    setDraft(String(value))
  }

  function commitEditing() {
    const parsed = Number(draft.trim())
    const valid =
      draft.trim() !== "" &&
      Number.isFinite(parsed) &&
      (min === undefined || parsed >= min) &&
      (max === undefined || parsed <= max)

    if (!valid) {
      // Req 3.11: reject, stay in edit mode, keep the prior value, show the error.
      setError(buildRangeMessage(min, max))
      setDraft(String(value))
      requestAnimationFrame(() => inputRef.current?.focus())
      return
    }

    setError(null)
    setEditing(false)
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
        // The one intentional accent the spec calls for: amber outline when
        // the value is unconfirmed.
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
              onBlur={commitEditing}
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
        </div>
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      )}

      {/* Evidence quote chip: the exact bill text this value came from. */}
      {evidence ? (
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
