// Feature: collab-ide, Property 3: Y.Text update round-trip
// Feature: collab-ide, Property 4: CRDT merge preserves concurrent edits
// Feature: collab-ide, Property 5: New joiner receives complete document state

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import * as Y from 'yjs'

// ─── Property 3: Y.Text update round-trip ────────────────────────────────────
describe('Y.Text round-trip', () => {
  it('Property 3: inserted text is always retrievable via toString()', () => {
    fc.assert(
      fc.property(
        // Any printable unicode string
        fc.string({ minLength: 0, maxLength: 500 }),
        (text) => {
          const doc = new Y.Doc()
          const yText = doc.getText('code')

          // Insert the text into Y.Text
          yText.insert(0, text)

          // The Y.Text value must exactly equal what was inserted
          expect(yText.toString()).toBe(text)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('multiple sequential inserts produce the expected concatenation', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
        (parts) => {
          const doc = new Y.Doc()
          const yText = doc.getText('code')

          // Insert each part at the end
          let pos = 0
          for (const part of parts) {
            yText.insert(pos, part)
            pos += part.length
          }

          expect(yText.toString()).toBe(parts.join(''))
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 4: CRDT merge preserves concurrent edits ───────────────────────
describe('CRDT concurrent edit merge', () => {
  it('Property 4: merging two independent edits preserves both', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (editA, editB) => {
          // Create a shared base document
          const baseDoc = new Y.Doc()
          baseDoc.getText('code').insert(0, 'base:')

          // Clone into two independent documents (simulating two clients)
          const docA = new Y.Doc()
          const docB = new Y.Doc()

          // Both start from the same state
          const baseState = Y.encodeStateAsUpdate(baseDoc)
          Y.applyUpdate(docA, baseState)
          Y.applyUpdate(docB, baseState)

          // Client A and Client B make independent edits concurrently
          docA.getText('code').insert(docA.getText('code').length, editA)
          docB.getText('code').insert(0, editB) // insert at start (concurrent)

          // Exchange updates — simulate what the relay server does
          const updateFromA = Y.encodeStateAsUpdate(docA)
          const updateFromB = Y.encodeStateAsUpdate(docB)

          Y.applyUpdate(docA, updateFromB)
          Y.applyUpdate(docB, updateFromA)

          // Both documents must converge to the same state (CRDT guarantee)
          expect(docA.getText('code').toString()).toBe(docB.getText('code').toString())

          // Neither edit should be lost
          const merged = docA.getText('code').toString()
          expect(merged).toContain(editA)
          expect(merged).toContain(editB)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 5: New joiner receives complete document state ─────────────────
describe('New joiner state sync', () => {
  it('Property 5: a fresh Y.Doc receiving a full-state update has identical content', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (content) => {
          // Simulate the existing room document
          const existingDoc = new Y.Doc()
          existingDoc.getText('code').insert(0, content)

          // Encode the full current state (what y-websocket sends on sync step 2)
          const fullState = Y.encodeStateAsUpdate(existingDoc)

          // New joiner starts with an empty doc and applies the full state
          const newJoinerDoc = new Y.Doc()
          Y.applyUpdate(newJoinerDoc, fullState)

          // The new joiner must see exactly what was in the room
          expect(newJoinerDoc.getText('code').toString()).toBe(content)
        }
      ),
      { numRuns: 100 }
    )
  })
})
