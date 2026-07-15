// Feature: collab-ide, Property 1: Room ID is always URL-safe and non-empty
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { generateRoomId } from '../utils/roomId.js'

describe('generateRoomId', () => {
  it('Property 1: always returns a non-empty URL-safe string', () => {
    // URL-safe alphabet used by nanoid: A-Za-z0-9_-
    const URL_SAFE_PATTERN = /^[A-Za-z0-9_-]+$/

    fc.assert(
      fc.property(
        // No input needed — just call the function many times
        fc.constant(null),
        () => {
          const id = generateRoomId()
          expect(id).toBeTruthy()
          expect(id.length).toBeGreaterThan(0)
          expect(id).toMatch(URL_SAFE_PATTERN)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('generates IDs of length 10', () => {
    const id = generateRoomId()
    expect(id).toHaveLength(10)
  })

  it('generates unique IDs on repeated calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRoomId()))
    // With 10-char nanoid, collision probability is astronomically low
    expect(ids.size).toBe(100)
  })
})
