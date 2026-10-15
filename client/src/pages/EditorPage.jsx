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
 * The selected language lives in a shared Y.Map ("meta") so everyone in the
 * room switches language together.
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
import RemoteCursorStyles from '../components/RemoteCursorStyles.jsx'
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
      // Keep the room ID so the landing page can pre-fill "Join room"
      navigate('/', { replace: true, state: { roomId } })
    }
  }, [navigate, roomId])

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

  // Picking a language writes it to the shared doc; the observer below applies
  // it locally, so the change reaches every client in the room the same way.
  const handleRuntimeChange = useCallback((runtime) => {
    if (ydoc) ydoc.getMap('meta').set('language', runtime.language)
    else setSelectedRuntime(runtime)
  }, [ydoc, setSelectedRuntime])

  useEffect(() => {
    if (!ydoc || runtimes.length === 0) return
    const meta = ydoc.getMap('meta')
    const applyShared = () => {
      const language = meta.get('language')
      const runtime = runtimes.find((r) => r.language === language)
      if (runtime) setSelectedRuntime(runtime)
    }
    applyShared()
    meta.observe(applyShared)
    return () => meta.unobserve(applyShared)
  }, [ydoc, runtimes, setSelectedRuntime])

  // ── Code execution ─────────────────────────────────────────────────────────
  const { execute, isRunning, output, execError } = useCodeExecution(selectedRuntime)
  const [stdin, setStdin] = useState('')

  const handleRun = useCallback(() => {
    if (!editorRef.current || isRunning) return
    const code = editorRef.current.getValue()
    execute(code, stdin)
  }, [execute, isRunning, stdin])

  // Monaco registers the Ctrl+Enter command once, at mount. Route it through a
  // ref so it always runs the latest handleRun (current stdin and language).
  const handleRunRef = useRef(handleRun)
  useEffect(() => {
    handleRunRef.current = handleRun
  }, [handleRun])

  // ── Monaco mount callback ──────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    setEditor(editor) // publish as state so useMonacoBinding re-runs and binds

    // Register Ctrl+Enter / Cmd+Enter keyboard shortcut for Run
    // Remote cursors/selections are broadcast by the y-monaco binding itself.
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => handleRunRef.current()
    )
  }, [])

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
      <RemoteCursorStyles
        states={presenceStates}
        localClientId={provider?.awareness?.clientID}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="editor-header">
        <span className="editor-header__title">Syncraft</span>

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
