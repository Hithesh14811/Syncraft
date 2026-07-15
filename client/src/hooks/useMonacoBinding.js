/**
 * useMonacoBinding.js — Binds the Yjs Y.Text to the Monaco editor model
 *
 * MonacoBinding (from y-monaco) is the glue between the CRDT document and the
 * Monaco editor. It:
 *   - Translates Monaco text changes → Yjs Y.Text operations
 *   - Translates Yjs Y.Text updates → Monaco model edits
 *   - Renders remote cursors/selections inside Monaco using CSS classes
 *     (.yRemoteSelection-{clientId}, .yRemoteSelectionHead-{clientId})
 *
 * The binding must be created AFTER both the Y.Doc and the Monaco editor
 * instance are available.
 *
 * IMPORTANT: `editor` must be passed as a STATE value, not a ref. Monaco loads
 * asynchronously (large bundle), so it almost always mounts *after* the Y.Doc /
 * provider are ready. If this hook depended on a ref, the effect would run once
 * with editor=null and never re-run when the ref was later populated (assigning
 * a ref triggers no re-render). Passing the editor as state means mounting it
 * re-renders the component and this effect re-runs with the editor present.
 */

import { useEffect, useRef } from 'react'
import { MonacoBinding } from 'y-monaco'

/**
 * Bind a Yjs Y.Text to a Monaco editor model, enabling real-time collaboration.
 *
 * @param {import('yjs').Doc | null} ydoc - The Yjs document
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor | null} editor - Monaco editor instance (state)
 * @param {import('y-websocket').WebsocketProvider | null} provider
 * @returns {{ binding: MonacoBinding | null }}
 */
export function useMonacoBinding(ydoc, editor, provider) {
  const bindingRef = useRef(null)

  useEffect(() => {
    // Wait until the Y.Doc, the Monaco editor instance, and the provider are all ready
    if (!ydoc || !editor || !provider) return

    const model = editor.getModel()
    if (!model) return

    // Get (or create) the shared Y.Text instance named "code".
    // All clients in the same room use the same key — this is how they share state.
    const yText = ydoc.getText('code')

    // Create the binding. Parameters:
    //   1. yText — the shared CRDT text
    //   2. model — the Monaco editor model
    //   3. Set([editor]) — set of editor instances to keep in sync
    //   4. provider.awareness — Yjs awareness for remote cursor display
    const binding = new MonacoBinding(
      yText,
      model,
      new Set([editor]),
      provider.awareness
    )
    bindingRef.current = binding

    return () => {
      binding.destroy()
      bindingRef.current = null
    }
  }, [ydoc, editor, provider])

  return { binding: bindingRef.current }
}
