import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export const MENU_WIDTH = 176
const DEFAULT_HEIGHT = 120
const GAP = 4
const VIEWPORT_PADDING = 8

/**
 * Computes viewport coordinates for a menu anchored to `anchorRef`.
 * Returns null while closed, otherwise { top, left }.
 */
export function useAnchoredMenuPosition(isOpen, anchorRef, options = {}) {
  const { width = MENU_WIDTH, estimatedHeight = DEFAULT_HEIGHT, isRtl = false } = options
  const [position, setPosition] = useState(null)

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null)
      return
    }

    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return

      const rect = anchor.getBoundingClientRect()
      const fitsBelow = rect.bottom + GAP + estimatedHeight <= window.innerHeight
      const fitsAbove = rect.top - GAP - estimatedHeight >= VIEWPORT_PADDING
      const top = !fitsBelow && fitsAbove ? rect.top - GAP - estimatedHeight : rect.bottom + GAP

      const desiredLeft = isRtl ? rect.left : rect.right - width
      const maxLeft = window.innerWidth - width - VIEWPORT_PADDING
      const left = Math.min(Math.max(desiredLeft, VIEWPORT_PADDING), Math.max(maxLeft, VIEWPORT_PADDING))

      setPosition({ top, left })
    }

    update()

    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [isOpen, anchorRef, width, estimatedHeight, isRtl])

  return position
}

/**
 * A dropdown that renders through a portal into document.body and is positioned
 * with `position: fixed` against its anchor element.
 *
 * Rendering inline would be clipped by any ancestor with `overflow` set (the app
 * shell uses overflow-x-hidden) and would stack beneath the fixed sidebar. The
 * portal makes the menu immune to both. Regression coverage lives in
 * AnchoredMenu.test.jsx.
 */
export default function AnchoredMenu({
  isOpen,
  anchorRef,
  onClose,
  isRtl = false,
  width = MENU_WIDTH,
  estimatedHeight = DEFAULT_HEIGHT,
  children,
}) {
  const position = useAnchoredMenuPosition(isOpen, anchorRef, { width, estimatedHeight, isRtl })

  if (!isOpen || !position) return null

  return createPortal(
    <>
      <div data-testid="anchored-menu-backdrop" className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        role="menu"
        style={{ top: position.top, left: position.left, width }}
        className="fixed bg-slate-950 border border-slate-850 rounded-xl shadow-2xl z-[70] p-1.5 space-y-1"
      >
        {children}
      </div>
    </>,
    document.body
  )
}