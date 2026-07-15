/**
 * useCollabEditor.js — Yjs CRDT + WebSocket collaboration hook
 *
 * This hook is the heart of the real-time collaboration. It:
 *   1. Creates a Y.Doc — the shared CRDT document for this room
 *   2. Creates a WebsocketProvider — syncs the Y.Doc over WebSockets to the server relay
 *   3. Sets the local awareness state (username + color) so other users see who's here
 *
 * Why Yjs/CRDT over Operational Transform (OT)?
 *   - CRDTs (Conflict-free Replicated Data Types) guarantee convergence without a
 *     central authority. Any two clients that receive the same set of operations will
 *     arrive at the same state, regardless of order.
 *   - OT requires a server to sequence operations and resolve conflicts centrally.
 *     CRDTs distribute this — our WebSocket server is a dumb relay, not an arbiter.
 *   - Yjs uses a YATA (Yet Another Transformation Approach) algorithm that handles
 *     concurrent insertions deterministically with sub-linear complexity.
 *
 * The Y.Doc contains one named Y.Text instance with key "code" — this is the
 * single shared text buffer. The MonacoBinding (in useMonacoBinding) binds this
 * Y.Text to the Monaco editor model.
 */

import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

/**
 * Initialize the Yjs collaborative editor for a given room.
 *
 * @param {string} roomId - The room ID (used as the Yjs docName)
 * @param {string} username - The local user's display name
 * @param {string} color - The local user's assigned hex color
 * @returns {{ ydoc: Y.Doc, provider: WebsocketProvider }}
 */
export function useCollabEditor(roomId, username, color) {
  // Hold the doc/provider in STATE, not refs. This is deliberate: assigning a
  // ref does not trigger a re-render, so consumers (useMonacoBinding, presence)
  // would keep seeing the initial null and the Monaco↔Yjs binding would never
  // be created. Using state re-renders the component once the objects exist.
  const [collab, setCollab] = useState({ ydoc: null, provider: null })

  useEffect(() => {
    if (!roomId) return

    // The WebSocket URL is configured via environment variable so it can be
    // changed for production deployments without touching source code.
    const wsUrl = import.meta.env.VITE_WS_URL ?? 'ws://localhost:1234'

    // Create the shared CRDT document. This Y.Doc will contain one Y.Text
    // instance with key "code" that all editors in the room share.
    const ydoc = new Y.Doc()

    // WebsocketProvider connects the Y.Doc to the server relay.
    // It sends Yjs binary update messages and receives updates from other clients.
    // The roomId is passed as the second argument — y-websocket appends it to
    // the WebSocket URL: ws://localhost:1234/<roomId>
    const provider = new WebsocketProvider(wsUrl, roomId, ydoc, {
      connect: true,
    })

    // Set the local user's presence state so other clients can display cursors
    // and the connected-users list. The awareness protocol is built into Yjs —
    // it broadcasts ephemeral state (not persisted in the CRDT document).
    provider.awareness.setLocalStateField('user', {
      name: username || 'Anonymous',
      color: color || '#2196f3',
    })

    // Publish the ready objects so consumers re-render and bind to them.
    setCollab({ ydoc, provider })

    // Cleanup runs on unmount AND on every StrictMode remount in dev. It fully
    // tears down this instance — provider.destroy() closes the WebSocket and
    // detaches awareness; ydoc.destroy() frees the CRDT — before the next effect
    // creates a fresh pair, so no zombie connection or stale doc survives.
    return () => {
      provider.destroy()
      ydoc.destroy()
      setCollab((prev) =>
        prev.ydoc === ydoc ? { ydoc: null, provider: null } : prev
      )
    }
  }, [roomId, username, color])

  return collab
}
