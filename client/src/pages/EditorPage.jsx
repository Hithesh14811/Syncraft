/**
 * EditorPage.jsx — Main collaborative editor view
 *
 * This page:
 *   1. Reads the roomId from the URL params
 *   2. Reads username/color from sessionStorage (redirects to / if missing)
 *   3. Initialises the Yjs document + WebSocket provider (useCollabEditor)
 *   4. Binds Yjs to Monaco once the editor mounts (useMonacoBinding)
 *   5. Manages presence, runtime selection, and code execution
 *
 * Layout (CSS flexbox column):
 *   ┌─────────────────────────────────────┐
 *   │  Header (presence, lang, run btn)   │  flex-shrink: 0
 *   ├─────────────────────────────────────┤
 *   │  TabBar (filename tab)              │  flex-shrink: 0  ┐
 *   │  Monaco Editor          70%         │                  │ editor-pane
 *   │                                     │                  ┘
 *   ├─────────────────────────────────────┤
 *   │  Stdin input                        │  flex-shrink: 0  ┐
 *   │  Output Panel           30%         │                  │ output-pane
 *   └─────────────────────────────────────┘                  ┘
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { useCollabEditor } from '../hooks/useCollabEditor.js'
import { useMonacoBinding } from '../hooks/useMonacoBinding.js'
import { usePresence } from '../hooks/usePresence.js'
import { useRuntimes } from '../hooks/useRuntimes.js'
import { useCodeExecution } from '../hooks/useCodeExecution.js'

import MonacoEditor from '../components/MonacoEditor.jsx'
import PresencePanel from '../components/PresencePanel.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import RunButton from '../components/RunButton.jsx'
import TabBar from '../components/TabBar.jsx'
import StdinInput from '../components/StdinInput.jsx'
import OutputPanel from '../components/OutputPanel.jsx'

import { getFilename } from '../utils/jdoodle.js'

export default function EditorPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  // Read session data set by LandingPage — redirect if missing
  const username = sessionStorage.getItem('username') || 'Anonymous'
  const color = sessionStorage.getItem('color') || '#2196f3'

  // Redirect to landing if no username was set (direct URL navigation)
  useEffect(() => {
    if (!sessionStorage.getItem('username')) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  // ── Collaboration ──────────────────────────────────────────────────────────
  const { ydoc, provider } = useCollabEditor(roomId, username, color)

  // editorRef holds the Monaco editor instance for imperative use (Run, cursor).
  // `editor` state mirrors it so the binding effect re-runs when Monaco mounts —
  // a ref assignment alone triggers no re-render, which was why sync never bound.
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const [editor, setEditor] = useState(null)

  useMonacoBinding(ydoc, editor, provider)

  // ── Presence ───────────────────────────────────────────────────────────────
  const presenceStates = usePresence(provider)

  // ── Runtimes & language selection ─────────────────────────────────────────
  const { runtimes, loading: runtimesLoading, error: runtimesError, selectedRuntime, setSelectedRuntime } = useRuntimes()

  // Update Monaco language mode when the selected runtime changes
  const handleRuntimeChange = useCallback((runtime) => {
    setSelectedRuntime(runtime)
    if (monacoRef.current && editorRef.current) {
      monacoRef.current.editor.setModelLanguage(
        editorRef.current.getModel(),
        runtime.monacoLang
      )
    }
  }, [setSelectedRuntime])

  // ── Code execution ─────────────────────────────────────────────────────────
  const { execute, isRunning, output, execError } = useCodeExecution(selectedRuntime)
  const [stdin, setStdin] = useState('')

  const handleRun = useCallback(() => {
    if (!editorRef.current || isRunning) return
    const code = editorRef.current.getValue()
    execute(code, stdin)
  }, [execute, isRunning, stdin])

  // ── Monaco mount callback ──────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    setEditor(editor) // publish as state so useMonacoBinding re-runs and binds

    // Register Ctrl+Enter / Cmd+Enter keyboard shortcut for Run
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => handleRun()
    )

    // Broadcast cursor/selection changes via Yjs awareness so remote users
    // see this client's cursor position rendered in their editors (via y-monaco).
    editor.onDidChangeCursorSelection((e) => {
      if (!provider?.awareness) return
      const sel = e.selection
      provider.awareness.setLocalStateField('cursor', {
        anchor: { line: sel.startLineNumber, character: sel.startColumn },
        head:   { line: sel.endLineNumber,   character: sel.endColumn },
      })
    })
  }, [handleRun, provider])

  // Set Monaco language when the selected runtime changes after editor mounts
  useEffect(() => {
    if (selectedRuntime && monacoRef.current && editorRef.current) {
      monacoRef.current.editor.setModelLanguage(
        editorRef.current.getModel(),
        selectedRuntime.monacoLang
      )
    }
  }, [selectedRuntime])

  const filename = getFilename(selectedRuntime?.language)

  return (
    <div className="editor-page">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="editor-header">
        <span className="editor-header__title">CollabIDE</span>

        <PresencePanel
          states={presenceStates}
          localClientId={provider?.awareness?.clientID}
        />

        <LanguageDropdown
          runtimes={runtimes}
          selectedRuntime={selectedRuntime}
          onSelect={handleRuntimeChange}
          error={runtimesError}
          loading={runtimesLoading}
        />

        <RunButton onClick={handleRun} isRunning={isRunning} />
      </header>

      {/* ── Editor pane (70%) ────────────────────────────────────────────── */}
      <div className="editor-main">
        <div className="editor-pane">
          <TabBar filename={filename} />
          <MonacoEditor
            language={selectedRuntime?.monacoLang ?? 'plaintext'}
            onMount={handleEditorMount}
          />
        </div>

        {/* ── Output pane (30%) ───────────────────────────────────────────── */}
        <div className="output-pane">
          <StdinInput value={stdin} onChange={setStdin} />
          <OutputPanel output={output} error={execError} />
        </div>
      </div>
    </div>
  )
}
