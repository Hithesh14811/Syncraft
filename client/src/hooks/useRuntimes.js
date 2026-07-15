/**
 * useRuntimes.js — Manage the language runtime list for the dropdown
 *
 * Uses a fixed fallback list (the client never calls JDoodle directly — the
 * proxy owns the language mapping and credentials).
 * Ensures the minimum required languages (JS, Python, C++, Java) are always present.
 */

import { useState, useEffect } from 'react'
import { FALLBACK_RUNTIMES, ensureRequiredRuntimes } from '../utils/jdoodle.js'

/**
 * @returns {{
 *   runtimes: object[],
 *   loading: boolean,
 *   error: string | null,
 *   selectedRuntime: object | null,
 *   setSelectedRuntime: (runtime: object) => void
 * }}
 */
export function useRuntimes() {
  const [runtimes, setRuntimes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedRuntime, setSelectedRuntime] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadRuntimes() {
      setLoading(true)
      setError(null)

      try {
        // Use fallback runtimes — the client never calls JDoodle directly
        const fallback = FALLBACK_RUNTIMES
        if (cancelled) return

        const complete = ensureRequiredRuntimes(fallback)
        setRuntimes(complete)

        const defaultRuntime =
          complete.find((r) => r.language.toLowerCase() === 'python') ||
          complete.find((r) => r.language.toLowerCase() === 'javascript') ||
          complete[0] ||
          null
        setSelectedRuntime(defaultRuntime)
      } catch (err) {
        if (cancelled) return

        console.warn('[useRuntimes] Failed to load runtimes:', err.message)
        setError('Could not load runtimes. Showing defaults.')
        const fallback = FALLBACK_RUNTIMES
        setRuntimes(ensureRequiredRuntimes(fallback))

        const fallbackDefault =
          fallback.find((r) => r.language === 'python') || fallback[0]
        setSelectedRuntime(fallbackDefault)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRuntimes()

    return () => { cancelled = true }
  }, [])

  return { runtimes, loading, error, selectedRuntime, setSelectedRuntime }
}