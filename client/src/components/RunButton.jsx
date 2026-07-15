/**
 * RunButton.jsx — Trigger code execution
 *
 * Disabled and shows a spinner while execution is pending.
 * Also shows a Ctrl+Enter tooltip as a hint for the keyboard shortcut.
 */

/**
 * @param {{ onClick: () => void, isRunning: boolean }} props
 */
export default function RunButton({ onClick, isRunning }) {
  return (
    <button
      className="btn btn--run"
      onClick={onClick}
      disabled={isRunning}
      title="Run code (Ctrl+Enter)"
      aria-label={isRunning ? 'Running…' : 'Run code'}
    >
      {isRunning ? (
        <>
          <span className="spinner" aria-hidden="true" />
          Running…
        </>
      ) : (
        <>
          <span aria-hidden="true">▶</span>
          Run
        </>
      )}
    </button>
  )
}
