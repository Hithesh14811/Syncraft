// Feature: collab-ide, Property 7: User color is always from the palette
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { pickUserColor, USER_COLOR_PALETTE } from '../utils/colors.js'

describe('pickUserColor', () => {
  it('Property 7: always returns a color from USER_COLOR_PALETTE matching hex format', () => {
    const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const color = pickUserColor()
          expect(USER_COLOR_PALETTE).toContain(color)
          expect(color).toMatch(HEX_COLOR_PATTERN)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('USER_COLOR_PALETTE has at least 8 colors', () => {
    expect(USER_COLOR_PALETTE.length).toBeGreaterThanOrEqual(8)
  })

  it('all palette colors are valid 6-digit hex strings', () => {
    const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
    for (const color of USER_COLOR_PALETTE) {
      expect(color).toMatch(HEX_COLOR_PATTERN)
    }
  })
})
