/**
 * TabBar.jsx — Cosmetic single-file tab
 *
 * The editor is intentionally single-file (multi-file is out of scope), but a
 * lone tab reads as "an IDE" and gives the filename a home. It shows the
 * filename derived from the selected language (e.g. main.py, Main.java) with a
 * small file-type glyph.
 *
 * This is purely presentational: there is no tab switching, no close button,
 * and no per-tab state. It renders exactly one, always-active tab.
 */

/**
 * @param {{ filename?: string }} props
 */
export default function TabBar({ filename = 'code.txt' }) {
  return (
    <div className="tab-bar" role="tablist" aria-label="Open files">
      <div
        className="tab-bar__tab tab-bar__tab--active"
        role="tab"
        aria-selected="true"
        title={filename}
      >
        <span className="tab-bar__icon" aria-hidden="true">📄</span>
        <span className="tab-bar__name">{filename}</span>
      </div>
    </div>
  )
}
