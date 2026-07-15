/**
 * StdinInput.jsx — Standard input for code execution
 *
 * Provides a text area where users can type program input before running.
 * This is critical for programs that use stdin (e.g. Python's input(), C's scanf).
 * Without this, many interactive programs would fail silently or hang.
 */

/**
 * @param {{ value: string, onChange: (value: string) => void }} props
 */
export default function StdinInput({ value, onChange }) {
  return (
    <div className="stdin-section">
      <div className="stdin-section__header">
        stdin (program input)
      </div>
      <textarea
        className="stdin-section__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type program input here…"
        spellCheck={false}
        aria-label="Standard input for program"
      />
    </div>
  )
}
