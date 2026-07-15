// Feature: collab-ide, Property 13: Execute request always conforms to the proxy schema
//
// Also covers the JDoodle execution flow (executeCode) against the three required
// scenarios — stdin input, a syntax/compile error, and an infinite-loop timeout —
// plus the isErrorOutput/isTimeoutOutput classification helpers. JDoodle is
// synchronous (single request), so a mocked fetch resolves once — no polling.
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  buildExecuteRequest,
  executeCode,
  isErrorOutput,
  isTimeoutOutput,
  FALLBACK_RUNTIMES,
} from '../utils/jdoodle.js'

// Arbitrary for a valid Runtime object.
// language is constrained to real, non-whitespace keys — the proxy rejects
// anything not in its LANGUAGE_MAP, so whitespace-only inputs are out of scope.
const runtimeArb = fc.record({
  language: fc.constantFrom('python', 'javascript', 'c++', 'java', 'rust', 'go'),
  version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
  aliases: fc.array(fc.string()),
})

describe('buildExecuteRequest', () => {
  it('Property 13: always produces a valid proxy execute schema request', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // non-empty code
        runtimeArb,
        fc.string(), // stdin (may be empty)
        (code, runtime, stdin) => {
          const req = buildExecuteRequest(code, runtime, stdin)

          expect(req.language).toBe(runtime.language)
          expect(req.version).toBe(runtime.version)
          expect(req.files).toHaveLength(1)
          expect(req.files[0].content).toBe(code)
          expect(req.stdin).toBe(stdin)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('uses empty string for stdin when not provided', () => {
    const runtime = FALLBACK_RUNTIMES[0]
    const req = buildExecuteRequest('print("hi")', runtime, undefined)
    expect(req.stdin).toBe('')
  })

  it('FALLBACK_RUNTIMES contains all four required languages', () => {
    const languages = FALLBACK_RUNTIMES.map((r) => r.language.toLowerCase())
    expect(languages).toContain('python')
    expect(languages).toContain('javascript')
    expect(languages).toContain('c++')
    expect(languages).toContain('java')
  })
})

// ─── executeCode: JDoodle synchronous flow ───────────────────────────────────
// Each scenario mocks fetch once (POST /api/execute) with a JDoodle-shaped body.
describe('executeCode (synchronous)', () => {
  const python = FALLBACK_RUNTIMES.find((r) => r.language === 'python')

  const jsonResponse = (body, ok = true, statusCode = 200) => ({
    ok,
    status: statusCode,
    json: async () => body,
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Case 1 — stdin input: forwards stdin and returns program output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ output: 'Hello, Ada!\n', statusCode: 200, memory: '7160', cpuTime: '0.01' })
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = buildExecuteRequest('name = input()\nprint(f"Hello, {name}!")', python, 'Ada')
    // The stdin must be carried through to the request the hook submits.
    expect(request.stdin).toBe('Ada')

    const result = await executeCode(request)

    // The proxy call carried the stdin through in the POST body.
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sentBody.stdin).toBe('Ada')

    expect(result.output).toBe('Hello, Ada!\n')
    expect(result.statusCode).toBe(200)
    expect(result.cpuTime).toBe('0.01')
    expect(isErrorOutput(result.output)).toBe(false)
    expect(isTimeoutOutput(result.output)).toBe(false)
  })

  it('Case 2 — syntax/compile error: output is classified as an error', async () => {
    // JDoodle returns the compiler error text inside `output` (no stderr field).
    const compileError =
      'jdoodle.cpp: In function ‘int main()’:\njdoodle.cpp:1:12: error: expected ‘)’ before ‘{’ token'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ output: compileError, statusCode: 200, memory: null, cpuTime: null }))
    )

    const cpp = FALLBACK_RUNTIMES.find((r) => r.language === 'c++')
    const result = await executeCode(buildExecuteRequest('int main( {', cpp, ''))

    expect(result.output).toContain('error: expected')
    expect(isErrorOutput(result.output)).toBe(true)
    expect(isTimeoutOutput(result.output)).toBe(false)
  })

  it('Case 3 — infinite loop / timeout: output is classified as a timeout', async () => {
    // JDoodle kills long-running code and returns this message inside `output`.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ output: 'JDoodle - Timeout. Your program is taking too long to execute.', statusCode: 200, memory: null, cpuTime: null })
      )
    )

    const result = await executeCode(buildExecuteRequest('while True: pass', python, ''))

    expect(isTimeoutOutput(result.output)).toBe(true)
    // A timeout must NOT also be flagged as a generic error (mutually exclusive).
    expect(isErrorOutput(result.output)).toBe(false)
  })

  it('throws a helpful error when the proxy/JDoodle call fails', async () => {
    // e.g. daily credit limit reached (429) or bad credentials (401).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ message: 'Daily limit reached' }) })
    )

    await expect(executeCode(buildExecuteRequest('print(1)', python, ''))).rejects.toThrow('Daily limit reached')
  })

  it('normalizes missing fields to null-safe values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    const result = await executeCode(buildExecuteRequest('print(1)', python, ''))
    expect(result.output).toBe('')
    expect(result.statusCode).toBeNull()
    expect(result.memory).toBeNull()
    expect(result.cpuTime).toBeNull()
  })
})

// ─── Output classification helpers ───────────────────────────────────────────
describe('isErrorOutput / isTimeoutOutput', () => {
  it('flags common cross-language error signatures', () => {
    const errors = [
      'Traceback (most recent call last):\n  File "x", line 1\nNameError: name x',
      'SyntaxError: invalid syntax',
      'Exception in thread "main" java.lang.NullPointerException',
      'panic: runtime error: index out of range',
      'segmentation fault',
      'error: expected ‘)’ before ‘{’ token',
    ]
    for (const e of errors) {
      expect(isErrorOutput(e)).toBe(true)
    }
  })

  it('does not flag normal program output as an error', () => {
    const normal = ['Hello, world!\n', '42\n', 'sum = 15\ndone', '']
    for (const n of normal) {
      expect(isErrorOutput(n)).toBe(false)
    }
  })

  it('flags JDoodle timeout wording and keeps it distinct from errors', () => {
    const timeout = 'JDoodle - Timeout. Your program is taking too long to execute.'
    expect(isTimeoutOutput(timeout)).toBe(true)
    expect(isErrorOutput(timeout)).toBe(false)
  })

  it('treats empty/nullish output as neither error nor timeout', () => {
    for (const v of ['', null, undefined]) {
      expect(isErrorOutput(v)).toBe(false)
      expect(isTimeoutOutput(v)).toBe(false)
    }
  })
})
