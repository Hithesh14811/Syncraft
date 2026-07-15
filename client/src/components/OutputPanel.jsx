/**
 * OutputPanel.jsx — Terminal-style execution output display (JDoodle)
 *
 * JDoodle returns a SINGLE combined `output` string — there is no separate
 * stderr channel. Compile errors, runtime errors, stack traces, and the
 * "taking too long to execute" timeout message all arrive inside `output`.
 *
 * So this panel classifies the output text heuristically:
 *   - isTimeoutOutput() → show a timeout notice (red)
 *   - isErrorOutput()   → render the whole output in the error (red) style
 *   - otherwise         → render as normal stdout (white)
 *
 * It also surfaces JDoodle's statusCode and the cpuTime/memory stats when present.
 *
 * States handled:
 *   - Nothing run yet: placeholder hint
 *   - Request-level error (network/proxy/credits): `error` prop, red
 *   - Empty output: "Program produced no output."
 */

import { isErrorOutput, isTimeoutOutput } from '../utils/jdoodle.js'

/**
 * @param {{
 *   output: {
 *     output: string,
 *     statusCode: number | null,
 *     memory: string | null,
 *     cpuTime: string | null
 *   } | null,
 *   error: string | null
 * }} props
 */
export default function OutputPanel({ output, error }) {
  // State: nothing has been run yet
  if (!output && !error) {
    return (
      <div className="output-panel">
        <div className="output-panel__header">
          <span>Output</span>
        </div>
        <div className="output-panel__body">
          <span className="output-panel__placeholder">
            Press Run (or Ctrl+Enter) to execute your code.
          </span>
        </div>
      </div>
    )
  }

  // State: a request-level error occurred (network failure, proxy error,
  // bad credentials, daily credit limit reached, etc.)
  if (error) {
    return (
      <div className="output-panel">
        <div className="output-panel__header">
          <span>Output</span>
          <span style={{ color: 'var(--text-error)' }}>Error</span>
        </div>
        <div className="output-panel__body">
          <div className="output-panel__error">{error}</div>
        </div>
      </div>
    )
  }

  const text = output?.output ?? ''
  const statusCode = output?.statusCode ?? null
  const isTimeout = isTimeoutOutput(text)
  const isError = isErrorOutput(text)
  const noOutput = text === ''

  // A non-zero statusCode is JDoodle's signal that the program exited abnormally.
  const nonZeroExit = statusCode !== null && statusCode !== 0

  return (
    <div className="output-panel">
      <div className="output-panel__header">
        <span>Output</span>
        {statusCode !== null && (
          <span
            className={`output-panel__exit${nonZeroExit ? ' output-panel__exit--nonzero' : ''}`}
            style={{ fontSize: '0.78rem' }}
          >
            Status: {statusCode}
          </span>
        )}
      </div>

      <div className="output-panel__body">
        {/* Empty output message */}
        {noOutput && (
          <span className="output-panel__no-output">Program produced no output.</span>
        )}

        {/* Timeout — JDoodle killed the run for exceeding its time limit */}
        {isTimeout && (
          <div className="output-panel__section">
            <div className="output-panel__label" style={{ color: 'var(--text-error)' }}>
              timeout
            </div>
            <pre className="output-panel__stderr">
              {text}
              {'\n'}Process killed: exceeded JDoodle execution time limit.
            </pre>
          </div>
        )}

        {/* Error-looking output — rendered red (JDoodle has no separate stderr) */}
        {!isTimeout && isError && (
          <div className="output-panel__section">
            <div className="output-panel__label" style={{ color: 'var(--text-error)' }}>
              stderr
            </div>
            <pre className="output-panel__stderr">{text}</pre>
          </div>
        )}

        {/* Normal program output */}
        {!isTimeout && !isError && !noOutput && (
          <div className="output-panel__section">
            <pre className="output-panel__stdout">{text}</pre>
          </div>
        )}

        {/* Execution stats — shown when JDoodle reports them */}
        {(output?.cpuTime || output?.memory) && (
          <div className="output-panel__section output-panel__stats">
            {output.cpuTime && <span>CPU: {output.cpuTime}s</span>}
            {output.memory && <span>Memory: {output.memory} KB</span>}
          </div>
        )}
      </div>
    </div>
  )
}
