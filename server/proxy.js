/**
 * proxy.js — JDoodle Compiler API proxy route
 *
 * JDoodle is synchronous: one request in, one result out (no submit-then-poll).
 *
 *   POST /api/execute — map language → JDoodle code + versionIndex, inject
 *                       credentials, forward to JDoodle, return the result.
 *
 * The JDoodle clientId/clientSecret stay server-side only — the browser never
 * sees them.
 */

import fetch from 'node-fetch'

const JDOODLE_URL = 'https://api.jdoodle.com/v1/execute'
const CLIENT_ID = process.env.JDOODLE_CLIENT_ID
const CLIENT_SECRET = process.env.JDOODLE_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('[proxy] JDOODLE_CLIENT_ID / JDOODLE_CLIENT_SECRET not set — execution will fail')
}

/**
 * Map our dropdown language keys → JDoodle language code + versionIndex.
 *
 * versionIndex selects the compiler/runtime version; "0" is the oldest and
 * higher indices are newer. The values below pin a recent, stable version per
 * language (JDoodle's current max index at time of writing).
 * Full list: https://docs.jdoodle.com/compiler-api/compiler-api
 */
export const LANGUAGE_MAP = {
  python:     { language: 'python3', versionIndex: '4' },
  javascript: { language: 'nodejs',  versionIndex: '4' },
  'c++':      { language: 'cpp17',   versionIndex: '1' },
  cpp:        { language: 'cpp17',   versionIndex: '1' },
  c:          { language: 'c',       versionIndex: '5' },
  java:       { language: 'java',    versionIndex: '4' },
  rust:       { language: 'rust',    versionIndex: '4' },
  go:         { language: 'go',      versionIndex: '4' },
  ruby:       { language: 'ruby',    versionIndex: '4' },
  php:        { language: 'php',     versionIndex: '4' },
  kotlin:     { language: 'kotlin',  versionIndex: '4' },
  swift:      { language: 'swift',   versionIndex: '4' },
  csharp:     { language: 'csharp',  versionIndex: '4' },
  bash:       { language: 'bash',    versionIndex: '4' },
  shell:      { language: 'bash',    versionIndex: '4' },
}

// Per-IP rate limit for /api/execute. Every run spends a JDoodle credit
// (200/day on the free tier), so a public deployment needs some protection.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = Number(process.env.EXECUTE_RATE_LIMIT) || 10
const MAX_SCRIPT_LENGTH = 50_000
const hits = new Map()

export function rateLimit(req, res, next) {
  const now = Date.now()
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ message: 'Too many runs. Please wait a minute and try again.' })
  }
  recent.push(now)
  hits.set(ip, recent)
  next()
}

// Drop idle entries so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now()
  for (const [ip, times] of hits) {
    if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(ip)
  }
}, RATE_LIMIT_WINDOW_MS).unref()

/**
 * POST /api/execute — run code on JDoodle and return the result.
 * Request body: { language, version, files: [{content}], stdin }
 * Response: { output, statusCode, memory, cpuTime }
 */
export async function proxyExecute(req, res) {
  const { language, files, stdin } = req.body

  const mapping = LANGUAGE_MAP[language?.toLowerCase()]
  if (!mapping) {
    return res.status(400).json({ message: `Unsupported language: ${language}` })
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(401).json({ message: 'Server missing JDoodle credentials' })
  }

  const script = files?.[0]?.content ?? ''
  if (typeof script !== 'string' || script.length > MAX_SCRIPT_LENGTH) {
    return res.status(413).json({ message: 'Code is too large to run.' })
  }

  try {
    const jdoodleRes = await fetch(JDOODLE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        script,
        language: mapping.language,
        versionIndex: mapping.versionIndex,
        stdin: stdin ?? '',
      }),
    })

    const data = await jdoodleRes.json().catch(() => ({}))

    if (!jdoodleRes.ok) {
      // JDoodle returns 401 for bad creds, 429 when the daily credit limit is
      // reached, etc. Surface its message so the client can show it.
      return res.status(jdoodleRes.status).json({
        message: data.error ?? `JDoodle error: ${jdoodleRes.status}`,
      })
    }

    // Pass the JDoodle result straight through: { output, statusCode, memory, cpuTime }
    res.json({
      output: data.output ?? '',
      statusCode: data.statusCode ?? null,
      memory: data.memory ?? null,
      cpuTime: data.cpuTime ?? null,
    })
  } catch (err) {
    console.error('[proxy] JDoodle execute error:', err)
    res.status(502).json({ message: `Proxy execute error: ${err.message}` })
  }
}
