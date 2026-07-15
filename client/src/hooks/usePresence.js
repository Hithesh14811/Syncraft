/**
 * usePresence.js — Subscribe to Yjs awareness state for presence display
 *
 * The Yjs awareness protocol broadcasts ephemeral state (not stored in the CRDT)
 * between all connected clients. Each client publishes:
 *   - user: { name, color }   — set on join
 *   - cursor: { anchor, head } — updated on every cursor/selection change
 *
 * This hook subscribes to awareness 'update' events and returns the current
 * map of all connected clients' states (including the local client).
 * The PresencePanel filters out the local client when rendering.
 */

import { useState, useEffect } from 'react'

/**
 * @param {import('y-websocket').WebsocketProvider | null} provider
 * @returns {Map<number, { user: { name: string, color: string } | null, cursor: object | null }>}
 */
export function usePresence(provider) {
  const [states, setStates] = useState(new Map())

  useEffect(() => {
    if (!provider) return

    const awareness = provider.awareness

    // Handler called whenever any client's awareness state changes
    // (including joins, leaves, and cursor moves)
    function onUpdate() {
      // getStates() returns a Map<clientId, state> for all currently connected peers
      setStates(new Map(awareness.getStates()))
    }

    // Subscribe to awareness changes
    awareness.on('update', onUpdate)

    // Populate immediately with current state
    onUpdate()

    return () => {
      awareness.off('update', onUpdate)
    }
  }, [provider])

  return states
}
