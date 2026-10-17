/**
 * Where the Dive in bubble is on the ferry screen: the diver jumps into it, and the water of the dive transition
 * rises out of it. Read from its still wrapper (`data-dive-bubble`), not the bobbing bubble.
 */
export function diveBubbleRect(): DOMRect | null {
  return document.querySelector('[data-dive-bubble]')?.getBoundingClientRect() ?? null
}

/** The middle of the Dive in bubble, or a spot near the lower right when it isn't on screen. */
export function diveCenter(w: number, h: number, ui: number) {
  const r = diveBubbleRect()
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: w - 220 * ui, y: h - 220 * ui }
}
