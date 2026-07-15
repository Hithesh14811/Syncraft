/**
 * useCodeExecution.js — Code execution state management (JDoodle)
 *
 * Manages the lifecycle of a JDoodle execution request via the server proxy:
 *   1. Set isRunning=true, disable the Run button
 *   2. POST to /api/execute (single synchronous request — no polling)
 *   3. On success: store the normalized result { output, statusCode, memory, cpuTime }
 *   4. On failure: store error message
 *   5. Set isRunning=false to re-enable the Run button
 *
 * JDoodle returns everything (including compile/runtime errors and timeout
 * messages) inside a single `output` string — OutputPanel classifies it.
 */

import { useState, useCallback } from 'react'
import { buildExecuteRequest, executeCode } from '../utils/jdoodle.js'

/**
 * @param {object | null} selectedRuntime - The currently selected runtime
 * @returns {{
 *   execute: (code: string, stdin: string) => Promise<void>,
 *   isRunning: boolean,
 *   output: object | null,
 *   execError: string | null
 * }}
 */
export function useCodeExecution(selectedRuntime) {
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState(null)
  const [execError, setExecError] = useState(null)

  const execute = useCallback(async (code, stdin) => {
    if (!selectedRuntime) {
      setExecError('No runtime selected. Please choose a language.')
      return
    }

    if (isRunning) return // guard against duplicate submissions

    setIsRunning(true)
    setOutput(null)
    setExecError(null)

    try {
      const request = buildExecuteRequest(code, selectedRuntime, stdin)
      const response = await executeCode(request)

      // response is the normalized JDoodle result:
      // { output, statusCode, memory, cpuTime }. OutputPanel classifies the
      // output string (error vs timeout vs normal) via the jdoodle helpers.
      setOutput(response)
    } catch (err) {
      // Network errors, proxy errors, timeouts, etc.
      setExecError(err.message ?? 'Execution failed. Please try again.')
    } finally {
      setIsRunning(false)
    }
  }, [selectedRuntime, isRunning])

  return { execute, isRunning, output, execError }
}