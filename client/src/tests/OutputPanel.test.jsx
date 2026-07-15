// Feature: collab-ide, Property 14: OutputPanel renders execution output for any response
//
// JDoodle returns a single combined `output` string (no separate stderr). The
// panel classifies it: normal output → stdout style, error-looking → red stderr
// style, timeout → red timeout notice. These tests exercise all branches.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as fc from 'fast-check'
import OutputPanel from '../components/OutputPanel.jsx'

// ─── Property 14: output text + status always render ─────────────────────────
describe('OutputPanel', () => {
  it('Property 14: the program output text always appears and status is labeled', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.integer({ min: 0, max: 255 }),
        (text, statusCode) => {
          const output = { output: text, statusCode, memory: null, cpuTime: null }

          const { unmount, container } = render(<OutputPanel output={output} error={null} />)

          try {
            // Whichever branch renders (stdout / stderr / timeout), the raw
            // output text is always shown.
            expect(container.textContent).toContain(text)
            // Status code is always labeled.
            expect(container.textContent).toContain(`Status: ${statusCode}`)
          } finally {
            unmount()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('shows placeholder when no output and no error', () => {
    render(<OutputPanel output={null} error={null} />)
    expect(screen.getByText(/press run/i)).toBeTruthy()
  })

  it('shows error message when the error prop is set (network/proxy/credits)', () => {
    render(<OutputPanel output={null} error="Daily limit reached" />)
    expect(screen.getByText(/daily limit reached/i)).toBeTruthy()
  })

  it('shows "no output" when the output string is empty', () => {
    const output = { output: '', statusCode: 0, memory: null, cpuTime: null }
    render(<OutputPanel output={output} error={null} />)
    expect(screen.getByText(/no output/i)).toBeTruthy()
  })

  it('renders normal program output in the stdout style', () => {
    const output = { output: 'Hello, world!\n', statusCode: 200, memory: '7100', cpuTime: '0.01' }
    const { container } = render(<OutputPanel output={output} error={null} />)
    const stdoutEl = container.querySelector('.output-panel__stdout')
    expect(stdoutEl).not.toBeNull()
    expect(stdoutEl.textContent).toContain('Hello, world!')
    // No error/timeout styling for clean output.
    expect(container.querySelector('.output-panel__stderr')).toBeNull()
  })

  it('renders error-looking output in the red stderr style', () => {
    const output = {
      output: 'Traceback (most recent call last):\nNameError: name x is not defined',
      statusCode: 200,
      memory: null,
      cpuTime: null,
    }
    const { container } = render(<OutputPanel output={output} error={null} />)
    const stderrEl = container.querySelector('.output-panel__stderr')
    expect(stderrEl).not.toBeNull()
    expect(stderrEl.textContent).toContain('NameError')
    // Error output is not shown in the stdout style.
    expect(container.querySelector('.output-panel__stdout')).toBeNull()
  })

  it('shows a timeout notice for JDoodle time-limit output', () => {
    const output = {
      output: 'JDoodle - Timeout. Your program is taking too long to execute.',
      statusCode: 200,
      memory: null,
      cpuTime: null,
    }
    const { container } = render(<OutputPanel output={output} error={null} />)
    expect(container.textContent).toMatch(/timeout/i)
    expect(container.textContent).toMatch(/time limit/i)
    // Rendered in the red (stderr) style.
    expect(container.querySelector('.output-panel__stderr')).not.toBeNull()
  })

  it('shows cpuTime and memory stats when JDoodle reports them', () => {
    const output = { output: 'ok\n', statusCode: 200, memory: '7160', cpuTime: '0.02' }
    const { container } = render(<OutputPanel output={output} error={null} />)
    const stats = container.querySelector('.output-panel__stats')
    expect(stats).not.toBeNull()
    expect(stats.textContent).toContain('0.02')
    expect(stats.textContent).toContain('7160')
  })
})
