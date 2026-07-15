/**
 * server.js — CollabIDE backend entry point
 *
 * Architecture:
 *   - Express handles HTTP routes (health check, optional Piston proxy)
 *   - The HTTP server is handed to the WebSocket relay (y-websocket)
 *   - The relay broadcasts Yjs CRDT updates between all clients in the same room
 *
 * The server is stateless from a business-logic perspective: no code is stored,
 * no users are tracked beyond what Yjs awareness provides in-memory.
 */

import express from 'express'
import http from 'http'
import 'dotenv/config'
import { attachRelay } from './relay.js'
import { proxyExecute } from './proxy.js'

const app = express()

// Parse JSON bodies for the proxy route
app.use(express.json())

// CORS headers so the browser client can reach this server from a different origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  next()
})

// Health check — used by deployment platforms (Render, etc.) to verify the
// server is running. Returns HTTP 200 with a simple JSON body.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// JDoodle proxy — forwards code execution requests to the JDoodle Compiler API.
// JDoodle is synchronous, so a single POST route handles the full round-trip;
// the client's clientId/clientSecret stay server-side (see proxy.js).
app.post('/api/execute', proxyExecute)

// Create the HTTP server and attach the Yjs WebSocket relay
const httpServer = http.createServer(app)
attachRelay(httpServer)

const PORT = process.env.PORT ?? 1234
httpServer.listen(PORT, () => {
  console.log(`[server] CollabIDE server listening on port ${PORT}`)
  console.log(`[server] Health check: http://localhost:${PORT}/health`)
  console.log(`[server] WebSocket relay: ws://localhost:${PORT}/<roomId>`)
})
