"use client"

import { cn } from "cn"
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * InfoTip — a tiny circular "?" button that reveals a plain-English definition
 * of a technical term on hover AND keyboard focus.
 *
 * Pattern-matches SourceLink: it wraps the shadcn Tooltip in its own
 * TooltipProvider so it works standalone anywhere in the tree. The trigger is a
 * real <button type="button"> so it is focusable and keyboard-accessible; the
 * definition comes from GLOSSARY[term]. No icon library — just the "?"
 * character inside a rounded border (no new dependencies).
 */
export interface InfoTipProps {
  /** Which glossary term to explain. The tooltip text is GLOSSARY[term]. */
  term: GlossaryKey
  /** Optional human label used in the aria-label (defaults to the term key). */
  label?: string
  className?: string
}

export function InfoTip({ term, label, className }: InfoTipProps) {
  const definition = GLOSSARY[term]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={`${label ?? term} — what's this?`}
          className={cn(
            "inline-flex size-4 cursor-help items-center justify-center rounded-full border border-muted-foreground/40 align-middle text-[10px] font-medium leading-none text-muted-foreground outline-none transition-colors hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            className
          )}
        >
          ?
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{definition}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
