/**
 * roomId.js — Room ID generation utility
 *
 * Generates a URL-safe random string using nanoid. The room ID doubles as:
 *   1. The URL path segment: /room/<roomId>
 *   2. The Yjs docName passed to WebsocketProvider and the server relay
 *
 * nanoid uses a URL-safe alphabet (A-Za-z0-9_-) by default, so no encoding
 * is needed when embedding the ID in URLs or WebSocket paths.
 */

import { nanoid } from 'nanoid'

/**
 * Generate a random, URL-safe room ID.
 * @returns {string} A 10-character URL-safe random string
 */
export function generateRoomId() {
  return nanoid(10)
}
