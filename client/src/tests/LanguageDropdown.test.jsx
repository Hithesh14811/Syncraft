// Feature: collab-ide, Property 10: Language dropdown always contains minimum required runtimes
// Feature: collab-ide, Property 11: Language dropdown renders name and version for every runtime
// Feature: collab-ide, Property 12: Monaco language mode matches selected runtime

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fc from 'fast-check'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import { FALLBACK_RUNTIMES, ensureRequiredRuntimes } from '../utils/jdoodle.js'

// A non-blank language identifier: contains no whitespace at all.
// Whitespace-only / whitespace-padded strings are excluded because the DOM
// collapses whitespace in <option> text, which would break substring matching
// (and no real language key contains whitespace anyway).
const languageArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0 && !/\s/.test(s))

// Arbitrary for a valid runtime object
const runtimeArb = fc.record({
  language: languageArb,
  version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
  aliases: fc.array(fc.string()),
  monacoLang: fc.string({ minLength: 1 }),
  label: fc.string({ minLength: 1 }),
})

// ─── Property 10: Minimum required runtimes ───────────────────────────────────
describe('LanguageDropdown minimum runtimes', () => {
  it('Property 10: always shows JS, Python, C++, Java regardless of input', () => {
    fc.assert(
      fc.property(
        fc.array(runtimeArb, { maxLength: 20 }),
        (inputRuntimes) => {
          // ensureRequiredRuntimes is what useRuntimes uses to guarantee coverage
          const merged = ensureRequiredRuntimes(inputRuntimes)
          const selected = merged[0]

          const { unmount } = render(
            <LanguageDropdown
              runtimes={merged}
              selectedRuntime={selected}
              onSelect={() => {}}
              error={null}
              loading={false}
            />
          )

          const select = screen.getByRole('combobox')
          const optionValues = Array.from(select.options).map((o) => o.value.toLowerCase())

          expect(optionValues).toContain('python')
          expect(optionValues).toContain('javascript')
          expect(optionValues).toContain('c++')
          expect(optionValues).toContain('java')

          unmount()
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ─── Property 11: Name and version visible for every runtime ─────────────────
describe('LanguageDropdown runtime display', () => {
  it('Property 11: every runtime language name and version appear in option text', () => {
    fc.assert(
      fc.property(
        fc.array(runtimeArb, { minLength: 1, maxLength: 10 }),
        (runtimes) => {
          // Give each runtime a label combining language + version
          const withLabels = runtimes.map((r) => ({
            ...r,
            label: `${r.language} ${r.version}`,
          }))

          const { unmount } = render(
            <LanguageDropdown
              runtimes={withLabels}
              selectedRuntime={withLabels[0]}
              onSelect={() => {}}
              error={null}
              loading={false}
            />
          )

          const select = screen.getByRole('combobox')
          const optionTexts = Array.from(select.options).map((o) => o.text)

          for (const rt of withLabels) {
            const hasOption = optionTexts.some(
              (t) => t.includes(rt.language) && t.includes(rt.version)
            )
            expect(hasOption).toBe(true)
          }

          unmount()
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ─── Property 12: Monaco language mode matches selected runtime ───────────────
describe('LanguageDropdown language mode update', () => {
  it('Property 12: onSelect is called with the runtime whose language was chosen', () => {
    fc.assert(
      fc.property(
        // Pick 2+ distinct runtimes so we can change selection
        fc.array(runtimeArb, { minLength: 2, maxLength: 8 }).map((rts) => {
          // Deduplicate by language
          const seen = new Set()
          return rts.filter((r) => {
            if (seen.has(r.language)) return false
            seen.add(r.language)
            return true
          })
        }).filter((rts) => rts.length >= 2),
        (runtimes) => {
          const onSelect = vi.fn()

          const { unmount } = render(
            <LanguageDropdown
              runtimes={runtimes}
              selectedRuntime={runtimes[0]}
              onSelect={onSelect}
              error={null}
              loading={false}
            />
          )

          const select = screen.getByRole('combobox')
          // Select the second runtime
          fireEvent.change(select, { target: { value: runtimes[1].language } })

          expect(onSelect).toHaveBeenCalledOnce()
          expect(onSelect.mock.calls[0][0].language).toBe(runtimes[1].language)

          unmount()
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ─── Fallback runtimes coverage ───────────────────────────────────────────────
describe('FALLBACK_RUNTIMES', () => {
  it('contains all four required languages', () => {
    const langs = FALLBACK_RUNTIMES.map((r) => r.language.toLowerCase())
    expect(langs).toContain('python')
    expect(langs).toContain('javascript')
    expect(langs).toContain('c++')
    expect(langs).toContain('java')
  })
})
