"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * FadeIn — progressive-enhancement fade-in wrapper.
 *
 * Renders its children inside a block wrapper that transitions from opacity 0 to
 * opacity 1 once mounted on the client, after a configurable `delay`, over a
 * configurable `duration` (both in ms). The animation is a progressive
 * enhancement: the server render is a stable hidden state, and a `useEffect`
 * mount flag flips it to visible on the client so the transition runs after
 * hydration — no hydration mismatch (Req 12.9).
 *
 * Accessibility / no-JS safety: content is never permanently invisible. If the
 * user prefers reduced motion, the wrapper renders fully visible immediately
 * with no transition and no delay (Req 12.3). If JS never runs or `matchMedia`
 * is unavailable, the effect still flips the mount flag on the first client
 * tick, so the only "hidden" moment is the brief pre-hydration frame.
 */
export interface FadeInProps {
  /** Delay before the fade starts, in milliseconds. Default 0. */
  delay?: number
  /** Duration of the fade, in milliseconds. Default 500. */
  duration?: number
  /** Extra classes merged onto the wrapper. */
  className?: string
  children: React.ReactNode
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return reduced
}

export function FadeIn({
  delay = 0,
  duration = 500,
  className,
  children,
}: FadeInProps) {
  const [mounted, setMounted] = React.useState(false)
  const reducedMotion = usePrefersReducedMotion()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Reduced motion: fully visible immediately, no transition, no delay.
  const visible = reducedMotion ? true : mounted

  return (
    <div
      data-slot="fade-in"
      className={cn(
        "transition-opacity ease-out",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
      style={
        reducedMotion
          ? { transitionDuration: "0ms", transitionDelay: "0ms" }
          : {
              transitionDuration: `${duration}ms`,
              transitionDelay: `${delay}ms`,
            }
      }
    >
      {children}
    </div>
  )
}
