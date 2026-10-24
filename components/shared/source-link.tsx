"use client"

import { cn } from "cn"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * SourceLink — a small, grey source link/tooltip rendered BENEATH a number.
 *
 * Requirement 11.1: beneath a displayed number, show either a source link that
 * opens the referenced source, or a tooltip that reveals the source on
 * hover/focus. Kept unobtrusive, focusable, and accessible.
 */
export interface SourceLinkProps {
  /** Short human-readable source label, e.g. "Mass Save, 2024". */
  label: string
  /** Optional source URL. When present, renders an anchor that opens it. */
  href?: string
  className?: string
}

export function SourceLink({ label, href, className }: SourceLinkProps) {
  const baseClasses =
    "inline-flex items-center text-xs text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50"

  // With an href we render a real link that opens the source in a new tab.
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(baseClasses, className)}
      >
        {label}
      </a>
    )
  }

  // Without an href we reveal the source via a hover/focus tooltip. The trigger
  // defaults to a <button>, so it stays focusable for keyboard users.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          className={cn(baseClasses, "cursor-help", className)}
        >
          {label}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
