// Feature: collab-ide, Property 2: Blank username is always rejected
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fc from 'fast-check'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '../pages/LandingPage.jsx'

// Mock useNavigate so we can assert navigation never happens
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  )
}

describe('LandingPage username validation', () => {
  it('Property 2: blank/whitespace-only username is always rejected', () => {
    fc.assert(
      fc.property(
        // Generate strings that are either empty or contain only whitespace
        fc.oneof(
          fc.constant(''),
          fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 })
        ),
        (blankUsername) => {
          mockNavigate.mockClear()

          const { unmount } = renderLanding()

          // Type the blank username into the input
          const usernameInput = screen.getByLabelText(/display name/i)
          fireEvent.change(usernameInput, { target: { value: blankUsername } })

          // Click "Create new room"
          const createBtn = screen.getByText(/create new room/i)
          fireEvent.click(createBtn)

          // An error message must appear
          const error = screen.queryByRole('alert')
          expect(error).not.toBeNull()
          expect(error.textContent.length).toBeGreaterThan(0)

          // Navigation must NOT have occurred
          expect(mockNavigate).not.toHaveBeenCalled()

          unmount()
        }
      ),
      { numRuns: 50 }
    )
  })

  it('valid username allows room creation and triggers navigation', () => {
    mockNavigate.mockClear()
    renderLanding()

    const usernameInput = screen.getByLabelText(/display name/i)
    fireEvent.change(usernameInput, { target: { value: 'Alice' } })

    const createBtn = screen.getByText(/create new room/i)
    fireEvent.click(createBtn)

    // Navigation should have been called with a /room/... path
    expect(mockNavigate).toHaveBeenCalledOnce()
    expect(mockNavigate.mock.calls[0][0]).toMatch(/^\/room\/[A-Za-z0-9_-]+$/)
  })

  it('empty room ID in join form shows an error', () => {
    renderLanding()

    const usernameInput = screen.getByLabelText(/display name/i)
    fireEvent.change(usernameInput, { target: { value: 'Bob' } })

    const joinBtn = screen.getByText(/join room/i)
    fireEvent.click(joinBtn)

    expect(screen.queryByRole('alert')).not.toBeNull()
  })
})
