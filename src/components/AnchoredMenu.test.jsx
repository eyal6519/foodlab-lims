import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createRef } from 'react'
import AnchoredMenu, { MENU_WIDTH } from './AnchoredMenu'

const GAP = 4
const PADDING = 8
const ESTIMATED_HEIGHT = 120

function makeAnchor({ top, bottom, left, right }) {
  const el = document.createElement('button')
  el.getBoundingClientRect = () => ({
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => {},
  })
  return el
}

function setViewport({ width, height }) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

function renderMenu(anchorRect, { isOpen = true, isRtl = false, onClose = vi.fn() } = {}) {
  const anchorRef = createRef()
  anchorRef.current = makeAnchor(anchorRect)

  const utils = render(
    <div data-testid="clipping-host">
      <AnchoredMenu isOpen={isOpen} anchorRef={anchorRef} onClose={onClose} isRtl={isRtl}>
        <button type="button">Rename</button>
      </AnchoredMenu>
    </div>
  )

  return { ...utils, onClose }
}

const VIEWPORT = { width: 1024, height: 768 }

beforeEach(() => {
  setViewport(VIEWPORT)
})

afterEach(() => {
  cleanup()
})

describe('AnchoredMenu', () => {
  describe('portal rendering (regression: menu was clipped by ancestor overflow)', () => {
    // Regression: the user menu was an absolutely-positioned child inside the
    // users list. The app shell sets overflow-x-hidden, which makes the root a
    // clipping container, so the menu was sliced off. Rendering into
    // document.body removes it from that container entirely.
    it('renders the menu into document.body, not inside its DOM parent', () => {
      renderMenu({ top: 300, bottom: 330, left: 800, right: 830 })

      const menu = screen.getByRole('menu')
      expect(menu).toBeInTheDocument()
      expect(screen.getByTestId('clipping-host')).toBeEmptyDOMElement()
      expect(document.body.contains(menu)).toBe(true)
    })

    it('positions the menu with fixed coordinates, not via CSS flow', () => {
      renderMenu({ top: 300, bottom: 330, left: 800, right: 830 })

      const menu = screen.getByRole('menu')
      expect(menu).toHaveClass('fixed')
      expect(menu).toHaveStyle({ top: '334px', left: '654px' })
    })

    it('renders nothing when closed', () => {
      renderMenu({ top: 300, bottom: 330, left: 800, right: 830 }, { isOpen: false })

      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(screen.queryByTestId('anchored-menu-backdrop')).not.toBeInTheDocument()
    })
  })

  describe('placement', () => {
    it('opens below the anchor when there is room', () => {
      renderMenu({ top: 100, bottom: 130, left: 400, right: 430 })

      expect(screen.getByRole('menu')).toHaveStyle({ top: '134px' })
    })

    it('flips above the anchor when there is not enough room below', () => {
      // bottom 700 + gap 4 + height 120 = 824 > 768, and there IS room above
      renderMenu({ top: 600, bottom: 700, left: 400, right: 430 })

      expect(screen.getByRole('menu')).toHaveStyle({ top: `${600 - GAP - ESTIMATED_HEIGHT}px` })
    })

    it('stays below when neither side has room, rather than going off-screen', () => {
      setViewport({ width: 1024, height: 200 })
      // Not enough room above or below; must not produce a negative top.
      renderMenu({ top: 20, bottom: 60, left: 400, right: 430 })

      const menu = screen.getByRole('menu')
      const { top } = menu.style
      expect(Number.parseInt(top, 10)).toBeGreaterThanOrEqual(0)
      expect(top).toBe('64px')
    })
  })

  describe('horizontal alignment', () => {
    it('aligns the menu right edge with the anchor in LTR', () => {
      renderMenu({ top: 100, bottom: 130, left: 400, right: 430 })

      expect(screen.getByRole('menu')).toHaveStyle({ left: `${430 - MENU_WIDTH}px` })
    })

    it('aligns the menu left edge with the anchor in RTL', () => {
      renderMenu({ top: 100, bottom: 130, left: 400, right: 430 }, { isRtl: true })

      expect(screen.getByRole('menu')).toHaveStyle({ left: '400px' })
    })

    it('clamps to the viewport padding when the anchor is near the left edge', () => {
      renderMenu({ top: 100, bottom: 130, left: 0, right: 30 })

      expect(screen.getByRole('menu')).toHaveStyle({ left: `${PADDING}px` })
    })

    it('clamps to the viewport padding when the anchor is near the right edge', () => {
      renderMenu({ top: 100, bottom: 130, left: 1010, right: 1024 })

      expect(screen.getByRole('menu')).toHaveStyle({ left: `${1024 - MENU_WIDTH - PADDING}px` })
    })
  })

  describe('interaction', () => {
    it('closes when the backdrop is clicked', () => {
      const { onClose } = renderMenu({ top: 100, bottom: 130, left: 400, right: 430 })

      fireEvent.click(screen.getByTestId('anchored-menu-backdrop'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('applies the requested fixed width', () => {
      renderMenu({ top: 100, bottom: 130, left: 400, right: 430 })

      expect(screen.getByRole('menu')).toHaveStyle({ width: `${MENU_WIDTH}px` })
    })
  })
})