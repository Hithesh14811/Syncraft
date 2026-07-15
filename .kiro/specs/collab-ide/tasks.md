# Implementation Plan: CollabIDE

## Overview

Implement CollabIDE in the order that lets you verify the hardest integration first: server relay → client scaffold → live CRDT sync (the non-negotiable checkpoint) → routing/presence → code execution → polish → deployment config. Each task builds directly on the previous one so there is no orphaned code at any stage.

The implementation language is **JavaScript/JSX** (React 18 + Vite on the client, Node.js on the server), with dependencies as specified in the design document.

---

## Tasks

- [x] 1. Scaffold the server (`/server`)
  - Create `/server/package.json` with `express`, `ws`, `y-websocket`, and `node-fetch` at the exact versions listed in the design.
  - Create `server/server.js`: instantiate an `http.createServer(app)`, mount the relay and routes, listen on `process.env.PORT ?? 1234`.
  - Create `server/relay.js`: import `setupWSConnection` from `y-websocket/bin/utils`, attach a `WebSocketServer` to the HTTP server, strip the leading `/` from `req.url` to derive `docName`, call `setupWSConnection(ws, req, { docName })`.
  - Create `server/proxy.js`: implement `POST /api/execute` that forwards the request body to `https://emkc.org/api/v2/piston/execute` using `node-fetch` and pipes the response back.
  - Add `GET /health` Express route returning `{ "status": "ok" }` with HTTP 200.
  - Install dependencies (`npm install` in `/server`).
  - Verify the server starts on port 1234, `/health` returns 200, and a WebSocket client can connect without errors.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 2. Scaffold the client (`/client`)
  - Run `npm create vite@latest client -- --template react` (or create manually) to produce the Vite + React project structure.
  - Update `/client/package.json` to include all dependencies at exact versions: `react ^18.2.0`, `react-dom ^18.2.0`, `react-router-dom ^6.22.0`, `@monaco-editor/react ^4.6.0`, `monaco-editor ^0.47.0`, `yjs ^13.6.15`, `y-websocket ^1.5.4`, `y-monaco ^0.1.6`, `nanoid ^5.0.7`.
  - Install dependencies (`npm install` in `/client`).
  - Replace the default `src/` contents with the directory structure from the design: `pages/`, `components/`, `hooks/`, `utils/`, `styles/`.
  - Create stub files (empty exports) for every component, hook, and util listed in the design so later tasks can import them without errors.
  - Create `client/vite.config.js` with `@vitejs/plugin-react`.
  - Confirm `npm run build` completes without errors (stubs are sufficient at this stage).
  - _Requirements: 9.1, 9.2_

- [x] 3. Implement utility modules
  - [x] 3.1 Implement `src/utils/roomId.js`
    - Export `generateRoomId()` that returns `nanoid(10)`.
    - _Requirements: 1.3_

  - [x]* 3.2 Write property test for `generateRoomId`
    - **Property 1: Room ID is always URL-safe and non-empty**
    - **Validates: Requirements 1.3**
    - Use `fast-check`: for any invocation assert non-empty and `/^[A-Za-z0-9_~-]+$/` match.
    - Tag: `// Feature: collab-ide, Property 1`

  - [x] 3.3 Implement `src/utils/colors.js`
    - Define and export `USER_COLOR_PALETTE` array of at least 8 distinct hex colors.
    - Export `pickUserColor()` that returns a random element from the palette.
    - _Requirements: 3.2_

  - [x]* 3.4 Write property test for `pickUserColor`
    - **Property 7: User color is always from the palette**
    - **Validates: Requirements 3.2**
    - Use `fast-check`: for any call, assert result is in `USER_COLOR_PALETTE` and matches `/^#[0-9a-fA-F]{6}$/`.
    - Tag: `// Feature: collab-ide, Property 7`

  - [x] 3.5 Implement `src/utils/piston.js`
    - Export `fetchRuntimes()`: `GET https://emkc.org/api/v2/piston/runtimes`, returns `Runtime[]`.
    - Export `buildExecuteRequest(code, runtime, stdin)`: returns the Piston v2 request body `{ language, version, files: [{ content }], stdin }`.
    - Export `executeCode(request)`: `POST` to `import.meta.env.VITE_EXECUTE_URL ?? 'https://emkc.org/api/v2/piston/execute'`, returns parsed `ExecuteResponse`.
    - Export `FALLBACK_RUNTIMES` constant.
    - _Requirements: 4.1, 5.1, 5.2, 8.1, 8.2, 8.3_

  - [x]* 3.6 Write property test for `buildExecuteRequest`
    - **Property 13: Execute request always conforms to Piston v2 schema**
    - **Validates: Requirements 5.1, 5.2**
    - Use `fast-check`: for any non-empty code string, valid Runtime, and any stdin string, assert the returned object has `language`, `version`, `files[0].content === code`, and `stdin`.
    - Tag: `// Feature: collab-ide, Property 13`

- [-] 4. Build core collaborative editor — **critical checkpoint**
  - [x] 4.1 Implement `src/hooks/useCollabEditor.js`
    - Accept `(roomId, username, color)`.
    - Create `new Y.Doc()` and `new WebsocketProvider(wsUrl, roomId, ydoc)` where `wsUrl = import.meta.env.VITE_WS_URL ?? 'ws://localhost:1234'`.
    - Call `provider.awareness.setLocalStateField('user', { name: username, color })` after connection.
    - Return `{ ydoc, provider }`.
    - Destroy provider and doc on unmount.
    - _Requirements: 2.1, 3.1, 8.1, 8.2, 8.3_

  - [x] 4.2 Implement `src/hooks/useMonacoBinding.js`
    - Accept `(ydoc, editorRef, provider)`.
    - Wait for both `ydoc` and `editorRef.current` to be non-null, then create `new MonacoBinding(ydoc.getText('code'), editorRef.current.getModel(), new Set([editorRef.current]), provider.awareness)`.
    - Destroy binding on unmount.
    - Return `{ binding }`.
    - _Requirements: 2.2, 2.5_

  - [x] 4.3 Implement `src/components/MonacoEditor.jsx`
    - Wrap `<Editor>` from `@monaco-editor/react` with `theme="vs-dark"`, `lineNumbers="on"`, `bracketPairColorization.enabled=true`, `suggest.showWords=true`.
    - Accept an `onMount` callback prop; forward the `editor` and `monaco` instances.
    - _Requirements: 6.2, 6.3_

  - [x]* 4.4 Write property test for Y.Text round-trip
    - **Property 3: Y.Text update round-trip**
    - **Validates: Requirements 2.3**
    - Use `fast-check`: for any string, insert into a `Y.Text`, assert `ytext.toString()` equals the inserted string.
    - Tag: `// Feature: collab-ide, Property 3`

  - [x]* 4.5 Write property test for CRDT merge
    - **Property 4: CRDT merge preserves concurrent edits**
    - **Validates: Requirements 2.4**
    - Use `fast-check`: create two Y.Doc instances from the same base, apply independent edits, exchange encoded update vectors, assert both docs contain both edits.
    - Tag: `// Feature: collab-ide, Property 4`

  - [x]* 4.6 Write property test for new-joiner sync
    - **Property 5: New joiner receives complete document state**
    - **Validates: Requirements 2.8**
    - Use `fast-check`: for any text content in a Y.Doc, encode its full state, apply to a fresh Y.Doc, assert identical `Y.Text` string.
    - Tag: `// Feature: collab-ide, Property 5`

  - [x] 4.7 Wire `EditorPage` with a hardcoded room for live-sync verification
    - Create `src/pages/EditorPage.jsx` that hardcodes `roomId = 'test-room'`, reads `username` and `color` from `sessionStorage` (with fallback values so the page loads without LandingPage navigation).
    - Call `useCollabEditor` and `useMonacoBinding`, render `<MonacoEditor onMount={...} />`.
    - Temporarily mount `EditorPage` at `/` in `App.jsx` for checkpoint testing.
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 4.8 Checkpoint — two browser tabs must sync text live
    - Start the server (`node server/server.js`).
    - Start the client dev server (`npm run dev` in `/client`).
    - Open two browser tabs at `http://localhost:5173`.
    - Type in one tab; confirm the text appears in the other tab within 500 ms.
    - **Do not proceed to task 5 until this is confirmed.**
    - _Requirements: 2.3, 2.6_

- [x] 5. Add room routing and landing page
  - [x] 5.1 Implement `src/utils/roomId.js` (if not already complete) and confirm `generateRoomId` is exported.
    - _Requirements: 1.3_

  - [x] 5.2 Implement `src/pages/LandingPage.jsx`
    - Render a `UsernameInput`, `CreateRoomButton`, and a `JoinRoomForm` (text input + submit button).
    - On "Create Room": validate username non-empty (show inline error on failure), call `generateRoomId()`, store `{ username, color }` in `sessionStorage`, navigate to `/room/:id` via `useNavigate`.
    - On "Join Room": same validation, navigate to `/room/:roomId` using the typed ID.
    - _Requirements: 1.1, 1.3, 1.4, 1.6, 1.7_

  - [x]* 5.3 Write property test for blank username rejection
    - **Property 2: Blank username is always rejected**
    - **Validates: Requirements 1.6, 1.7**
    - Use `fast-check`: for any string of only whitespace (or empty), render `<LandingPage>`, submit it as the username, assert that a validation error is rendered and no navigation occurred.
    - Tag: `// Feature: collab-ide, Property 2`

  - [x] 5.4 Update `src/App.jsx` with React Router routes
    - Mount `<LandingPage>` at `/` and `<EditorPage>` at `/room/:roomId`.
    - _Requirements: 1.1, 1.2_

  - [x] 5.5 Update `EditorPage` to read `roomId` from `useParams` and handle missing session
    - Read `:roomId` via `useParams()`.
    - Read `username` and `color` from `sessionStorage`; if missing, redirect to `/` with `useNavigate`.
    - Remove the hardcoded `roomId = 'test-room'` from task 4.7.
    - _Requirements: 1.2, 1.5_

- [x] 6. Add user presence and live cursors
  - [x] 6.1 Implement `src/hooks/usePresence.js`
    - Accept `provider`.
    - Subscribe to `provider.awareness` `update` events.
    - Return the current `Map<clientId, AwarenessState>` (all states from `awareness.getStates()`).
    - Unsubscribe on unmount.
    - _Requirements: 3.4, 3.5, 3.6_

  - [x] 6.2 Implement `src/components/PresencePanel.jsx`
    - Accept `states` prop (`Map<clientId, AwarenessState>`).
    - Render a coloured dot + username for each entry whose `user` field is non-null, excluding the local `clientId`.
    - _Requirements: 3.5_

  - [x]* 6.3 Write property test for awareness user state round-trip
    - **Property 6: Awareness user state round-trip**
    - **Validates: Requirements 3.1**
    - Use `fast-check`: for any username and hex color, call `awareness.setLocalStateField('user', { name, color })`, assert `awareness.getLocalState().user` has identical `name` and `color`.
    - Tag: `// Feature: collab-ide, Property 6`

  - [x]* 6.4 Write property test for cursor awareness
    - **Property 8: Cursor awareness reflects any Monaco position**
    - **Validates: Requirements 3.3**
    - Use `fast-check`: for any `{ lineNumber, column }`, call the cursor update handler, assert `awareness.getLocalState().cursor.anchor` equals `{ line: lineNumber, character: column }`.
    - Tag: `// Feature: collab-ide, Property 8`

  - [x]* 6.5 Write property test for PresencePanel rendering
    - **Property 9: PresencePanel renders all connected users**
    - **Validates: Requirements 3.5**
    - Use `fast-check`: for any non-empty map of awareness states with `user` fields, render `<PresencePanel>`, assert each username appears in the output and a DOM element has the corresponding color style.
    - Tag: `// Feature: collab-ide, Property 9`

  - [x] 6.6 Wire cursor updates into EditorPage
    - In `EditorPage`, register a `monaco.onDidChangeCursorSelection` listener that calls `provider.awareness.setLocalStateField('cursor', { anchor, head })`.
    - Pass the awareness `states` from `usePresence` down to `PresencePanel`.
    - _Requirements: 3.3, 3.4_

- [ ] 7. Checkpoint — verify presence features
  - Open two browser tabs at different `/room/:roomId` URLs and the same URL.
  - Confirm: cursors appear in each other's editors with distinct colors; the `PresencePanel` lists both users; closing a tab removes the user within 5 seconds.
  - Ensure all property tests added so far pass (`npx vitest run` in `/client`).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [-] 8. Build code execution
  - [x] 8.1 Implement `src/hooks/useRuntimes.js`
    - On mount, call `fetchRuntimes()` from `piston.js`.
    - On success: set `runtimes` state to the fetched list; set `selectedRuntime` to the first JavaScript or Python entry.
    - On failure: set `runtimes` to `FALLBACK_RUNTIMES`; set `runtimesError` message.
    - Return `{ runtimes, loading, error, selectedRuntime, setSelectedRuntime }`.
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 8.2 Implement `src/components/LanguageDropdown.jsx`
    - Accept `{ runtimes, selectedRuntime, onSelect, error }`.
    - Render a `<select>` with one `<option>` per runtime showing `language vVersion` (e.g. "python 3.10.0").
    - When `error` is set, render a non-blocking banner above the dropdown.
    - On `onChange`, call `onSelect(runtime)` and update Monaco language via `monaco.editor.setModelLanguage`.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 6.6_

  - [x]* 8.3 Write property test for language dropdown minimum runtimes
    - **Property 10: Language dropdown always contains minimum required runtimes**
    - **Validates: Requirements 4.2**
    - Use `fast-check`: for any array of Runtime objects (including empty), render `<LanguageDropdown>` with the merged result of the input plus fallbacks, assert options for JavaScript, Python, C++, and Java are all present.
    - Tag: `// Feature: collab-ide, Property 10`

  - [x]* 8.4 Write property test for language dropdown name/version rendering
    - **Property 11: Language dropdown renders name and version for every runtime**
    - **Validates: Requirements 4.4**
    - Use `fast-check`: for any non-empty Runtime array, render `<LanguageDropdown>`, assert each runtime's `language` and `version` strings appear as visible text.
    - Tag: `// Feature: collab-ide, Property 11`

  - [x]* 8.5 Write property test for Monaco language mode matching
    - **Property 12: Monaco language mode matches selected runtime**
    - **Validates: Requirements 4.5**
    - Use `fast-check`: for any Runtime selection change event, mock `monaco.editor.setModelLanguage`, assert it is called with the identifier corresponding to the selected runtime's `language`.
    - Tag: `// Feature: collab-ide, Property 12`

  - [x] 8.6 Implement `src/hooks/useCodeExecution.js`
    - Accept `selectedRuntime`.
    - Expose `execute(code, stdin)`: set `isRunning = true`, call `executeCode(buildExecuteRequest(code, runtime, stdin))`, set `output` on success or `execError` on failure, set `isRunning = false`.
    - Return `{ execute, isRunning, output, execError }`.
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

  - [x] 8.7 Implement `src/components/RunButton.jsx`
    - Accept `{ onClick, isRunning }`.
    - Render a `<button>` disabled when `isRunning`; show a spinner/loading label when `isRunning`.
    - _Requirements: 5.3_

  - [x] 8.8 Implement `src/components/StdinInput.jsx`
    - Render a `<textarea>` for multi-line standard input.
    - Accept `{ value, onChange }` props.
    - _Requirements: 5.9_

  - [x] 8.9 Implement `src/components/OutputPanel.jsx`
    - Accept `{ output, error }`.
    - Render `run.stdout` in white monospace, `run.stderr` in red, exit code with a "Exit:" label.
    - If `stdout === ''` and `stderr === ''`, display "Program produced no output."
    - If `error` is set, display the error string in the panel.
    - Apply terminal-style CSS: dark background, monospace font.
    - _Requirements: 5.4, 5.5, 5.6, 5.8, 6.4_

  - [ ]* 8.10 Write property test for OutputPanel rendering
    - **Property 14: OutputPanel renders all result fields for any response**
    - **Validates: Requirements 5.4, 5.8**
    - Use `fast-check`: for any `ExecuteResponse` with arbitrary `run.stdout`, `run.stderr`, and `run.code`, render `<OutputPanel>`, assert stdout appears as text, stderr has red styling, and exit code is labeled.
    - Tag: `// Feature: collab-ide, Property 14`

  - [ ] 8.11 Wire execution into EditorPage
    - Import `useRuntimes`, `useCodeExecution`, `LanguageDropdown`, `RunButton`, `StdinInput`, `OutputPanel` into `EditorPage`.
    - On `LanguageDropdown` change: call `setSelectedRuntime(runtime)` and `monaco.editor.setModelLanguage(model, lang)`.
    - On `RunButton` click or `Ctrl+Enter` / `Cmd+Enter` (registered via `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, ...)`): call `execute(editorContent, stdinValue)`.
    - Render `<StdinInput>` and `<OutputPanel>` below the editor.
    - _Requirements: 4.5, 5.1, 5.3, 5.7, 6.6_

- [ ] 9. Checkpoint — verify code execution with three test programs
  - Run a **stdin program**: a Python or JS script that reads from stdin and prints it back; confirm stdout in the output panel.
  - Run a **syntax-error program**: submit code with a deliberate syntax error; confirm non-zero exit code and stderr displayed in red.
  - Run an **infinite-loop program**: submit an infinite loop; confirm that Piston's timeout kills it and the output panel shows the result (non-zero exit/signal) without hanging the UI.
  - Ensure `RunButton` is re-enabled after each execution.
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.8_

- [ ] 10. Apply IDE layout polish
  - [ ] 10.1 Implement `src/components/TabBar.jsx`
    - Render a single tab element showing the current filename (e.g. `main.py`, `index.js` based on selected runtime, or a static `code`).
    - _Requirements: 6.5_

  - [ ] 10.2 Apply split-pane layout to `EditorPage`
    - Use CSS flexbox/grid to allocate ~70% vertical space to the Monaco editor and ~30% to the output area (`StdinInput` + `OutputPanel`).
    - Add a `Header` element containing `PresencePanel`, `LanguageDropdown`, and `RunButton`.
    - Place `TabBar` above `MonacoEditor`.
    - _Requirements: 6.1, 6.5_

  - [ ] 10.3 Apply terminal-style CSS to `OutputPanel` and global styles
    - Dark background (`#1e1e1e` or equivalent), white/green text for stdout, red for stderr, monospace font.
    - Apply to `src/styles/index.css`; import in `main.jsx`.
    - _Requirements: 6.3, 6.4_

  - [ ] 10.4 Add `Ctrl+Enter` / `Cmd+Enter` shortcut via Monaco `addCommand`
    - Register the shortcut in the `MonacoEditor` `onMount` callback and wire it to the `execute` function.
    - _Requirements: 5.7_

- [ ] 11. Checkpoint — final integration
  - Run all client property-based tests: `npx vitest run` in `/client`; all 14 properties must pass.
  - Run a full end-to-end scenario: open two tabs, collaborate on a Python script with stdin, run it, confirm both users see the output.
  - Confirm `/health` returns 200 on the server.
  - _Requirements: all_

- [ ] 12. Write README
  - Create a root-level `README.md` covering:
    - Project overview and features list.
    - Architecture diagram (copy from design or ASCII equivalent) referencing the two-service topology.
    - CRDT-vs-OT explanation: why Yjs (CRDT) was chosen over OT, convergence guarantees.
    - Local development setup: `npm install` in `/client` and `/server`, start commands, env var configuration.
    - Deployment notes: `VITE_WS_URL` env var, building the client, pointing to the hosted server.
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] 13. Add deployment configuration
  - Create `vercel.json` at the repo root to deploy the `/client` Vite build to Vercel (set `root: "client"`, `buildCommand: "npm run build"`, `outputDirectory: "dist"`).
  - Create a `render.yaml` (or equivalent) at the repo root to deploy the `/server` Node process to Render (set `startCommand: "node server.js"`, expose port 1234).
  - Document the deployment steps and environment variable settings (`VITE_WS_URL` pointing at the Render service URL) in the README.
  - _Requirements: 8.1, 8.2, 8.3, 9.1_

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Core functionality is fully implemented without them.
- Property tests live in `/client/src/tests/` and use `fast-check` with a minimum of 100 iterations each.
- Each property test file should begin with the tag comment `// Feature: collab-ide, Property N: <property text>`.
- The two non-negotiable checkpoints are Task 4.8 (live two-tab sync) and Task 9 (three code-execution scenarios). Do not proceed past them without confirming the behaviour in a browser.
- All 14 correctness properties from the design document are covered by optional sub-tasks (Properties 1–14 mapped to tasks 3.2, 5.3, 4.4, 4.5, 4.6, 6.3, 3.4, 6.4, 6.5, 8.3, 8.4, 8.5, 3.6, 8.10 respectively).
