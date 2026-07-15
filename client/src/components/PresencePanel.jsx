/**
 * PresencePanel.jsx — Connected users list in the editor header
 *
 * Renders a colored dot + username for each user currently in the room.
 * The local client is excluded (users don't need to see themselves listed).
 *
 * Data comes from the Yjs awareness protocol via usePresence().
 * When a user disconnects, y-websocket removes their awareness entry within
 * the configured timeout (~5s), causing this list to update automatically.
 */

/**
 * @param {{
 *   states: Map<number, { user?: { name: string, color: string } }>,
 *   localClientId: number | undefined
 * }} props
 */
export default function PresencePanel({ states = new Map(), localClientId }) {
  // Collect users from awareness states, skipping the local client
  const users = []
  for (const [clientId, state] of states) {
    if (clientId === localClientId) continue
    if (state?.user?.name) {
      users.push({ clientId, name: state.user.name, color: state.user.color })
    }
  }

  if (users.length === 0) return null

  return (
    <div className="presence-panel" aria-label="Connected users">
      {users.map(({ clientId, name, color }) => (
        <div key={clientId} className="presence-panel__user" title={name}>
          <span
            className="presence-panel__dot"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span>{name}</span>
        </div>
      ))}
    </div>
  )
}
