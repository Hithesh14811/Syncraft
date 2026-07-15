/**
 * LanguageDropdown.jsx — Language/runtime selector
 *
 * Renders a <select> populated with the available language runtimes.
 * Shows a non-blocking warning banner if the runtime list fell back to defaults.
 * On selection change: notifies the parent, which updates Monaco's language mode.
 */

/**
 * @param {{
 *   runtimes: Array<{ language: string, version: string, label: string }>,
 *   selectedRuntime: object | null,
 *   onSelect: (runtime: object) => void,
 *   error: string | null,
 *   loading: boolean,
 * }} props
 */
export default function LanguageDropdown({ runtimes = [], selectedRuntime, onSelect, error, loading }) {
  function handleChange(e) {
    const runtime = runtimes.find((r) => r.language === e.target.value)
    if (runtime) onSelect(runtime)
  }

  return (
    <div className="language-dropdown">
      {error && (
        <span className="language-dropdown__warning" title={error}>
          ⚠ Default runtimes
        </span>
      )}
      <select
        className="language-dropdown__select"
        value={selectedRuntime?.language ?? ''}
        onChange={handleChange}
        disabled={loading}
        aria-label="Select language"
      >
        {loading && <option value="">Loading runtimes…</option>}
        {runtimes.map((rt) => (
          <option key={`${rt.language}-${rt.version}`} value={rt.language}>
            {rt.label ?? `${rt.language} ${rt.version}`}
          </option>
        ))}
      </select>
    </div>
  )
}
