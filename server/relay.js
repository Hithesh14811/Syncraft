/**
 * relay.js — Yjs WebSocket relay
 *
 * This is the only "real" server-side logic. It uses y-websocket's built-in
 * setupWSConnection helper to handle the full Yjs sync protocol:
 *   - Sync step 1/2 (initial state exchange between new joiner and existing peers)
 *   - Awareness updates (cursor positions, usernames, colors)
 *   - Ping/pong keepalives
 *
 * Room isolation is achieved by passing the room ID as `docName`. The helper
 * maintains an internal Map<docName, WSSharedDoc> so clients sharing the same
 * docName automatically share the same in-memory Yjs document.
 *
 * The server does NOT inspect, parse, or store the content of Yjs messages —
 * it is a pure relay. All CRDT conflict resolution happens on the client via Yjs.
 */

import { setupWSConnection } from 'y-websocket/bin/utils'
import { WebSocketServer } from 'ws'

/**
 * Attach the Yjs WebSocket relay to an existing HTTP server.
 * @param {import('http').Server} httpServer
 */
export function attachRelay(httpServer) {
  const wss = new WebSocketServer({ server: httpServer })

  // Live connection count per room — for debugging real-time sync. If two
  // browsers are truly in the same room, the count for that roomId reaches 2.
  const roomConnections = new Map()

  wss.on('connection', (ws, req) => {
    // The y-websocket client connects to ws://host/<roomId>. req.url is
    // "/<roomId>" (possibly with a "?query"). Strip the leading slash and any
    // query string, then decode, so the docName is exactly the room ID — a
    // stray query param must not split two clients into different docs.
    const rawUrl = req.url ?? '/default'
    const pathOnly = rawUrl.split('?')[0]
    const roomId = decodeURIComponent(pathOnly.slice(1)) || 'default'

    const count = (roomConnections.get(roomId) ?? 0) + 1
    roomConnections.set(roomId, count)
    console.log(`[relay] + client connected -> room "${roomId}" (url="${rawUrl}") -- ${count} now in room`)

    ws.on('close', () => {
      const remaining = Math.max(0, (roomConnections.get(roomId) ?? 1) - 1)
      roomConnections.set(roomId, remaining)
      console.log(`[relay] - client disconnected <- room "${roomId}" -- ${remaining} left in room`)
    })

    // setupWSConnection handles everything: sync protocol, awareness, ping/pong.
    // Passing docName ensures room isolation — only clients with the same roomId
    // share the same in-memory WSSharedDoc.
    setupWSConnection(ws, req, { docName: roomId })
  })

  wss.on('error', (err) => {
    console.error('[relay] WebSocketServer error:', err)
  })

  console.log('[relay] WebSocket relay attached')
}
