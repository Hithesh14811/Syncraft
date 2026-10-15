/**
 * RemoteCursorStyles.jsx — Per-user colors for remote cursors and selections
 *
 * y-monaco decorates remote selections with the classes
 * .yRemoteSelection-{clientId} and .yRemoteSelectionHead-{clientId} but ships
 * no styles for them, so without this they are invisible. We generate one rule
 * set per connected user from their awareness color, plus a name label on the
 * cursor head.
 */

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * @param {Map<number, { user?: { name: string, color: string } }>} states
 * @param {number | undefined} localClientId
 * @returns {string}
 */
export function buildCursorCss(states, localClientId) {
  let css = ''
  for (const [clientId, state] of states) {
    if (clientId === localClientId) continue
    const color = state?.user?.color
    if (!HEX_COLOR.test(color ?? '')) continue
    const name = JSON.stringify(String(state.user.name ?? '').slice(0, 32))
    css += `
.yRemoteSelection-${clientId} { background-color: ${color}40; }
.yRemoteSelectionHead-${clientId} {
  position: absolute;
  height: 100%;
  border-left: 2px solid ${color};
  box-sizing: border-box;
}
.yRemoteSelectionHead-${clientId}::after {
  content: ${name};
  position: absolute;
  top: -1.3em;
  left: -2px;
  padding: 0 4px;
  font-size: 11px;
  line-height: 1.3em;
  white-space: nowrap;
  color: #fff;
  background-color: ${color};
  border-radius: 2px 2px 2px 0;
  pointer-events: none;
}`
  }
  return css
}

export default function RemoteCursorStyles({ states, localClientId }) {
  return <style>{buildCursorCss(states, localClientId)}</style>
}
