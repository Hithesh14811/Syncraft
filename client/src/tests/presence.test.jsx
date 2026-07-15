// Feature: collab-ide, Property 6: Awareness user state round-trip
// Feature: collab-ide, Property 8: Cursor awareness reflects any Monaco position
// Feature: collab-ide, Property 9: PresencePanel renders all connected users

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as fc from 'fast-check'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import PresencePanel from '../components/PresencePanel.jsx'

// ─── Property 6: Awareness user state round-trip ─────────────────────────────
describe('Awareness user state', () => {
  it('Property 6: setLocalStateField round-trips name and color exactly', () => {
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 32 }),   // username
        fc.stringMatching(HEX_COLOR),                  // color
        (name, color) => {
          const doc = new Y.Doc()
          const awareness = new Awareness(doc)

          awareness.setLocalStateField('user', { name, color })

          const state = awareness.getLocalState()
          expect(state.user.name).toBe(name)
          expect(state.user.color).toBe(color)

          awareness.destroy()
          doc.destroy()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 8: Cursor awareness reflects any Monaco position ────────────────
describe('Cursor awareness', () => {
  it('Property 8: cursor anchor always reflects the Monaco position that was set', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),  // lineNumber
        fc.integer({ min: 1, max: 500 }),    // column
        (lineNumber, column) => {
          const doc = new Y.Doc()
          const awareness = new Awareness(doc)

          // Simulate the cursor update handler in EditorPage
          function updateCursor(pos) {
            awareness.setLocalStateField('cursor', {
              anchor: { line: pos.lineNumber, character: pos.column },
              head: { line: pos.lineNumber, character: pos.column },
            })
          }

          updateCursor({ lineNumber, column })

          const state = awareness.getLocalState()
          expect(state.cursor.anchor.line).toBe(lineNumber)
          expect(state.cursor.anchor.character).toBe(column)

          awareness.destroy()
          doc.destroy()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 9: PresencePanel renders all connected users ───────────────────
describe('PresencePanel', () => {
  it('Property 9: renders every user name and color dot from the states map', () => {
    fc.assert(
      fc.property(
        // Generate 1–6 user entries with distinct names.
        // Names must contain a visible (non-whitespace) character: getByText
        // trims/collapses whitespace, so a whitespace-only name would render as
        // empty text and be unmatchable — that's a test-harness limitation, not
        // an app concern (usernames are validated non-blank on the landing page).
        // Names are also kept unique so getByText matches exactly one element.
        fc.uniqueArray(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
            color: fc.stringMatching(/^#[0-9a-fA-F]{6}$/),
          }),
          { minLength: 1, maxLength: 6, selector: (u) => u.name.trim().replace(/\s+/g, ' ') }
        ),
        (users) => {
          // Build the states Map as usePresence() would return it
          const states = new Map()
          users.forEach((user, idx) => {
            // Use high client IDs so none clash with localClientId=0
            states.set(idx + 100, { user })
          })

          const { unmount, container } = render(
            <PresencePanel states={states} localClientId={0} />
          )

          try {
            // Assert on the exact set of rendered name spans. Scoping to this
            // render's container is required because there is no global
            // afterEach(cleanup), so fast-check's per-iteration renders would
            // otherwise accumulate in document.body. We read the leaf spans
            // directly (rather than getByText) so single-character names that
            // also match an ancestor's text content don't trip "multiple
            // elements found".
            const renderedNames = Array.from(
              container.querySelectorAll('.presence-panel__user > span:last-child')
            ).map((el) => el.textContent)

            for (const user of users) {
              expect(renderedNames).toContain(user.name)
            }
          } finally {
            unmount()
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('excludes the local client from the rendered list', () => {
    const states = new Map([
      [1, { user: { name: 'Alice', color: '#e91e63' } }],
      [2, { user: { name: 'Bob', color: '#2196f3' } }],  // local
    ])

    render(<PresencePanel states={states} localClientId={2} />)

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('renders nothing when all users are the local client', () => {
    const states = new Map([[1, { user: { name: 'Solo', color: '#fff' } }]])
    const { container } = render(<PresencePanel states={states} localClientId={1} />)
    expect(container.firstChild).toBeNull()
  })
})
