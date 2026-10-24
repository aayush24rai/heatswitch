"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * AnimatedHeading — per-character entrance animation for hero headings.
 *
 * Splits `text` into lines on "\n" (rendering a <br/> between lines) and each
 * line into individual characters. Each character is an `inline-block` span that
 * animates from opacity 0 + translateX(-18px) to opacity 1 + translateX(0) over
 * 500ms, with a 30ms stagger between consecutive characters and a 200ms initial
 * delay. The per-character `transitionDelay` is `200 + index * 30` ms, where
 * `index` counts characters in order across the whole heading (spaces count as
 * characters for timing).
 *
 * Wrapping: each word's characters are grouped inside a `whitespace-nowrap`
 * word span so a word never breaks in the middle; the only break opportunities
 * are the real (breakable) spaces rendered between words and the "\n" hard
 * breaks. The inter-word space is a per-character animated span too (so it keeps
 * its stagger), but a plain " " that the browser may wrap on — never "\u00A0" —
 * so long lines wrap at word boundaries instead of mid-word (Req 12.3).
 *
 * SSR-safe (Req 12.9): the server render and the first client render match (all
 * characters start hidden); a `useEffect` mount flag flips them to the shown
 * state so the transition runs after hydration — no mismatch, and content is
 * never permanently hidden.
 *
 * `prefers-reduced-motion`: all characters render fully visible immediately with
 * no per-character transition or stagger (Req 12.3).
 *
 * Semantics: this component renders a single <span> container (not a heading
 * element). The caller is expected to place it inside its own <h1>/<h2> so the
 * page controls the semantic level. `className` and `style` are applied to the
 * container (the hero passes `letterSpacing` via `style`).
 */
export interface AnimatedHeadingProps {
  /** Heading text; may contain "\n" to force line breaks. */
  text: string
  /** Classes merged onto the container span. */
  className?: string
  /** Inline styles applied to the container span (e.g. letterSpacing). */
  style?: React.CSSProperties
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

export function AnimatedHeading({
  text,
  className,
  style,
}: AnimatedHeadingProps) {
  const [mounted, setMounted] = React.useState(false)
  const reducedMotion = usePrefersReducedMotion()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const shown = reducedMotion ? true : mounted

  const lines = text.split("\n")
  // Running character index across the whole heading so the stagger is
  // continuous across line breaks (spaces included).
  let charIndex = 0

  return (
    <span
      data-slot="animated-heading"
      className={cn("block", className)}
      style={style}
    >
      {lines.map((line, lineIdx) => {
        // Split the line into runs separated by spaces, keeping the spaces as
        // their own single-space tokens. Word tokens are rendered inside a
        // `whitespace-nowrap` span (never break mid-word); the space tokens are
        // breakable " " characters between words, so wrapping only happens at
        // word boundaries (and at the "\n" line breaks between lines).
        const tokens = line.split(/( )/).filter((t) => t.length > 0)

        const renderChar = (char: string) => {
          const index = charIndex++
          const delay = 200 + index * 30
          return (
            <span
              key={index}
              aria-hidden="true"
              className="inline-block will-change-transform"
              style={
                reducedMotion
                  ? undefined
                  : {
                      opacity: shown ? 1 : 0,
                      transform: shown
                        ? "translateX(0)"
                        : "translateX(-18px)",
                      transitionProperty: "opacity, transform",
                      transitionDuration: "500ms",
                      transitionTimingFunction: "ease-out",
                      transitionDelay: `${delay}ms`,
                    }
              }
            >
              {char}
            </span>
          )
        }

        return (
          <React.Fragment key={lineIdx}>
            {lineIdx > 0 ? <br /> : null}
            {tokens.map((token, tokenIdx) => {
              if (token === " ") {
                // A real breakable space in the normal inline flow — this is
                // the only place the browser may wrap a line. It still consumes
                // a stagger slot so timing stays continuous across words, but it
                // renders as plain " " (not an inline-block atom), so the break
                // opportunity between the two word spans is preserved.
                charIndex++
                return <React.Fragment key={`sp-${tokenIdx}`}> </React.Fragment>
              }
              return (
                <span
                  key={`w-${tokenIdx}`}
                  className="inline-block whitespace-nowrap"
                >
                  {Array.from(token).map((char) => renderChar(char))}
                </span>
              )
            })}
          </React.Fragment>
        )
      })}
    </span>
  )
}
