# Design Document

## CollabIDE – Real-Time Collaborative Code Editor

---

## Overview

CollabIDE is a browser-based, room-scoped collaborative IDE. Multiple users share a single code buffer in real time using Yjs CRDTs, see each other's cursors via the Yjs Awareness protocol, and execute code against the public Piston API without any server-side code storage.

The system is split into two independently deployable pieces:

- **Client** — a Vite + React SPA under `/client`. Routes handle the Landing Page (`/`) and Editor Page (`/room/:roomId`). All CRDT synchronisation and code execution logic lives here.
- **Server** — a thin Node.js + Express process under `/server`. Its only real job is to run the `y-websocket` relay that broadcasts Yjs document updates between all peers in the same room. An optional `/api/execute` proxy route covers environments where the browser cannot reach the Piston API directly due to CORS.

**Key design constraints from requirements:**

- No authentication – the Room ID is the sole access-control token.
- No server-side state persistence – the relay is purely in-memory.
- Conflict resolution is entirely delegated to the Yjs CRDT; no custom merge logic.
- All code execution goes directly from the browser to the Piston API (or through the thin proxy).
- The WebSocket URL must be configurable at build time via `VITE_WS_URL`.

**Research findings:**

- `y-websocket` exposes a `setupWSConnection(ws, req, { docName })` helper in `y-websocket/bin/utils` that handles the full Yjs sync protocol (step 1/2, awareness, pings). Room isolation is achieved by passing the room name as `docName`; the helper manages per-document awareness and keeps an in-memory map keyed by document name ([y-websocket source](https://github.com/yjs/y-websocket)).
- `y-monaco` `MonacoBinding` takes `(Y.Text, monaco.ITextModel, Set<editor>, awareness)` and renders remote cursors using CSS classes `yRemoteSelection-${clientId}` and `yRemoteSelectionHead-${clientId}` ([y-monaco source](https://github.com/yjs/y-monaco)).
- Piston API v2 `POST /execute` accepts `{ language, version, files: [{ name?, content }], stdin?, args? }` and returns `{ language, version, run: { stdout, stderr, code, signal, status } }`. A `compile` key is also present for compiled languages. Note: as of Feb 2026 the public API requires an authorisation key; the design supports self-hosted instances via environment config ([Piston docs](https://github.com/engineer-man/piston)).

---

## Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│  ┌────────────┐   React Router   ┌──────────────────┐  │
│  │Landing_Page│ ───────────────► │  Editor_Page     │  │
│  └────────────┘                  │                  │  │
│                                  │  ┌────────────┐  │  │
│                                  │  │  Monaco    │  │  │
│                                  │  │  Editor    │  │  │
│                                  │  └─────┬──────┘  │  │
│                                  │        │ MonacoBinding│
│                                  │  ┌─────▼──────┐  │  │
│                                  │  │  Y.Doc     │  │  │
│                                  │  │  Y.Text    │  │  │
│                                  │  └─────┬──────┘  │  │
│                                  │        │ WebsocketProvider│
│                                  └────────┼─────────┘  │
└───────────────────────────────────────────┼─────────────┘
                                            │ WebSocket (ws://)
                          ┌─────────────────▼──────────────┐
                          │        Node.js Server           │
                          │                                 │
                          │   Express HTTP                  │
                          │   ├── GET /health  → 200 OK     │
                          │   └── POST /api/execute (opt.)  │
                          │                                 │
                          │   WebSocket Relay               │
                          │   └── setupWSConnection()       │
                          │       (y-websocket/bin/utils)   │
                          │       rooms keyed by Room_ID    │
                          └─────────────────────────────────┘
                                            │
                                            │ HTTPS
                          ┌─────────────────▼──────────────┐
                          │       Piston API (external)     │
                          │  GET  /api/v2/piston/runtimes   │
                          │  POST /api/v2/piston/execute    │
                          └─────────────────────────────────┘
```

### Deployment Topology

```
/client  ──── vite build ──►  static files  ──► CDN / static host
/server  ──── node server.js  ──────────────►  Node host (port 1234)
```

The client and server are decoupled: the client only needs `VITE_WS_URL` to point at wherever the server runs.

---

## Components and Interfaces

### Client Components

```
App
├── LandingPage           (route: /)
│   ├── UsernameInput
│   ├── CreateRoomButton
│   └── JoinRoomForm
│
└── EditorPage            (route: /room/:roomId)
    ├── Header
    │   ├── PresencePanel
    │   ├── LanguageDropdown
    │   └── RunButton
    ├── TabBar             (shows filename)
    ├── MonacoEditor       (wraps @monaco-editor/react)
    ├── StdinInput
    └── OutputPanel
```

#### `LandingPage`

| Responsibility | Detail |
|---|---|
| Collect Username | Validates non-empty before allowing navigation |
| Create Room | Generates `nanoid()`-based Room_ID, stores Username in `sessionStorage`, navigates to `/room/:id` |
| Join Room | Accepts typed Room_ID, stores Username, navigates |

State: `{ username: string, roomId: string, error: string | null }`

#### `EditorPage`

Owns the Yjs lifecycle. On mount it creates the `Y.Doc`, `WebsocketProvider`, and `MonacoBinding`. On unmount it calls `provider.destroy()` and `binding.destroy()`.

Props: none (reads `:roomId` from `useParams()`, Username from `sessionStorage`)

State managed by custom hooks (see State Management section).

#### `MonacoEditor`

Thin wrapper around `@monaco-editor/react`. Receives `onMount` callback so `EditorPage` can obtain the `editor` and `model` references needed by `MonacoBinding`.

Config: `theme: "vs-dark"`, `lineNumbers: "on"`, `bracketPairColorization`, `suggest.showWords`.

#### `PresencePanel`

Subscribes to `provider.awareness` `update` events. Renders a coloured dot + username for each entry in `awareness.getStates()` excluding the local client.

#### `LanguageDropdown`

On mount, fetches runtimes from Piston. Falls back to a hardcoded list on failure. On change: (1) updates selected runtime state, (2) calls `monaco.editor.setModelLanguage(model, lang)`.

#### `OutputPanel`

Displays execution results. Uses a monospace dark terminal style. Shows stdout in white, stderr in red, exit code as a labelled line. Shows "No output" if both stdout and stderr are empty.

#### `RunButton`

Disabled + shows spinner while `isRunning === true`. Also registers a `Ctrl+Enter` / `Cmd+Enter` keyboard shortcut via Monaco's `addCommand` API.

### Server Modules

```
server/
├── server.js        – Express + HTTP server bootstrap
├── relay.js         – WebSocket upgrade handler using setupWSConnection
└── proxy.js         – Optional /api/execute proxy route
```

#### `relay.js`

```js
import { setupWSConnection } from 'y-websocket/bin/utils'
import { WebSocketServer } from 'ws'

export function attachRelay(httpServer) {
  const wss = new WebSocketServer({ server: httpServer })
  wss.on('connection', (ws, req) => {
    // Room_ID is extracted from URL path: ws://host/room/<roomId>
    const roomId = req.url?.slice(1) ?? 'default'
    setupWSConnection(ws, req, { docName: roomId })
  })
}
```

`setupWSConnection` internally maintains a `Map<string, WSSharedDoc>` keyed by `docName`. Each `WSSharedDoc` holds the in-memory Yjs document and the awareness state for all connected peers. This means room isolation is automatic – clients that share a `docName` get the same document.

#### `proxy.js`

When enabled, proxies `POST /api/execute` → `POST https://emkc.org/api/v2/piston/execute`, forwarding the JSON body and returning the JSON response. Handles CORS for the browser.

---

## Data Models

### Room_ID

```ts
type RoomId = string  // URL-safe random string, e.g. nanoid(10): "V1StGXR8_Z"
```

Generated client-side using `nanoid` (URL-safe, no server round-trip needed). The Room_ID serves as both the URL path segment and the `docName` passed to `WebsocketProvider`.

### Session State (sessionStorage)

```ts
interface SessionState {
  username: string   // entered on LandingPage, persisted for Editor reload
  color: string      // hex color picked from palette on LandingPage, e.g. "#e91e63"
}
```

Stored in `sessionStorage` so it survives navigations within the same tab but not cross-tab sharing.

### Yjs Document Shape

```ts
// The single shared Y.Doc for a room
const ydoc = new Y.Doc()

// The shared text buffer – this is what MonacoBinding binds to
const sharedText: Y.Text = ydoc.getText('code')
// Key: 'code' is a fixed string; all clients in the same room use the same key
```

The `Y.Doc` contains one named `Y.Text` instance with key `"code"`. This is the only shared data structure; all editor content lives here. No other Y types (Map, Array) are needed for the core feature.

### Awareness State Schema

```ts
// Set by each client on join:
provider.awareness.setLocalStateField('user', {
  name: string,   // Username from sessionStorage
  color: string,  // User_Color hex string from sessionStorage
})

// Cursor/selection updated on every Monaco cursor change:
provider.awareness.setLocalStateField('cursor', {
  anchor: { line: number, character: number },   // Monaco IPosition
  head:   { line: number, character: number },   // Monaco IPosition (end of selection)
})

// Full awareness map type (one entry per connected clientId):
type AwarenessState = {
  user:   { name: string; color: string } | null
  cursor: { anchor: { line: number; character: number };
             head:   { line: number; character: number } } | null
}
```

The `MonacoBinding` handles cursor rendering automatically when `awareness` is passed to its constructor. The `PresencePanel` reads `user` fields from awareness states to render the connected-users list.

### Runtime (from Piston `/runtimes`)

```ts
interface Runtime {
  language: string   // e.g. "python", "javascript", "c++", "java"
  version:  string   // e.g. "3.10.0"
  aliases:  string[] // e.g. ["py", "py3"]
}
```

Stored in component state after fetch. The fallback list:

```ts
const FALLBACK_RUNTIMES: Runtime[] = [
  { language: 'javascript', version: '18.15.0', aliases: ['js', 'node'] },
  { language: 'python',     version: '3.10.0',  aliases: ['py', 'py3'] },
  { language: 'c++',        version: '10.2.0',  aliases: ['cpp'] },
  { language: 'java',       version: '15.0.2',  aliases: [] },
]
```

### Execute_Request

```ts
interface ExecuteRequest {
  language: string            // Runtime.language
  version:  string            // Runtime.version
  files: [{ content: string }] // single entry: editor text
  stdin:    string            // contents of StdinInput; empty string if blank
}
```

### Execute_Response

```ts
// Success (HTTP 200)
interface ExecuteResponse {
  language: string
  version:  string
  run: {
    stdout:  string
    stderr:  string
    code:    number | null   // exit code; null if killed by signal
    signal:  string | null
    status:  string | null   // "RE" | "SG" | "TO" | "OL" | "EL" | "XX" | null
    message: string | null
  }
  compile?: {               // present only for compiled languages
    stdout:  string
    stderr:  string
    code:    number | null
    signal:  string | null
    status:  string | null
    message: string | null
  }
}

// Error (HTTP 400 / network error)
interface ExecuteError {
  message: string
}
```

### UI State (EditorPage)

```ts
interface EditorPageState {
  // Runtime selection
  runtimes:        Runtime[]
  runtimesLoading: boolean
  runtimesError:   string | null
  selectedRuntime: Runtime | null

  // Execution
  isRunning:       boolean
  output:          ExecuteResponse['run'] | null
  execError:       string | null

  // Editor
  editorReady:     boolean   // true once Monaco onMount fires
}
```

---

## WebSocket Relay Design

### Room Routing

The y-websocket URL convention is `ws://<host>/<roomName>`. The client constructs:

```ts
const wsUrl = import.meta.env.VITE_WS_URL ?? 'ws://localhost:1234'
const provider = new WebsocketProvider(wsUrl, roomId, ydoc)
// y-websocket appends roomId as the path: ws://localhost:1234/<roomId>
```

On the server, `req.url` is `/V1StGXR8_Z` (the room ID with a leading slash). The relay strips the leading slash and passes it as `docName` to `setupWSConnection`. The `setupWSConnection` helper from `y-websocket/bin/utils` internally maintains:

```
docs: Map<docName, WSSharedDoc>
```

where each `WSSharedDoc`:
- Holds the full in-memory `Y.Doc` update log since the first client connected.
- Manages a set of connected WebSocket clients.
- Broadcasts updates to all clients sharing the same `docName`.
- Handles ping/pong keepalives.
- Cleans up when the last client disconnects (the doc is removed from the map).

This means **no room management code** is needed in the application — it's all handled by `y-websocket`.

### Message Flow

```
Client A (types)
  │
  ├─► MonacoBinding updates Y.Text
  ├─► Y.Doc emits 'update' event
  ├─► WebsocketProvider sends binary Yjs update message to Server
  │
  Server (relay.js)
  ├─► setupWSConnection receives message
  ├─► Applies update to in-memory WSSharedDoc
  ├─► Broadcasts update to all other clients in same room
  │
Client B (receives)
  ├─► WebsocketProvider receives binary update
  ├─► Y.Doc applies CRDT merge
  └─► MonacoBinding reflects merged state in editor
```

### New User Sync

When a new client connects and sends a `sync step 1` message, `setupWSConnection` replies with `sync step 2` containing the full current document state. This is handled entirely by the y-websocket protocol — the application layer does not need to implement it.

### Health Check

```
GET /health → HTTP 200 { "status": "ok" }
```

Implemented as a simple Express route. No dependencies on WebSocket state.

---

## Code Execution Flow

### Direct Client-to-Piston (primary)

```
User clicks Run
  │
  ├─► Validate: selectedRuntime not null, editor not empty
  ├─► Set isRunning = true, disable RunButton
  │
  ├─► POST https://emkc.org/api/v2/piston/execute
  │   Body: { language, version, files: [{ content }], stdin }
  │
  ├─► On success (200):
  │   ├─► Parse ExecuteResponse
  │   ├─► Combine compile.stderr (if present) + run.stderr → display in red
  │   ├─► Display run.stdout
  │   ├─► Display exit code: run.code
  │   └─► Set isRunning = false
  │
  └─► On error (non-200 or network):
      ├─► Display error message in OutputPanel
      └─► Set isRunning = false
```

### Proxy Route (fallback for CORS)

When the browser cannot reach the Piston API directly (e.g., in certain deployment environments), the client can be configured to POST to `/api/execute` on the same origin as the WebSocket server. The server proxy route:

```
Client → POST /api/execute
  │
  Server (proxy.js)
  ├─► Forward body to https://emkc.org/api/v2/piston/execute
  ├─► Return response JSON to client
  └─► Pass through HTTP status codes
```

The client determines which endpoint to use based on a build-time env var `VITE_EXECUTE_URL` (defaults to `https://emkc.org/api/v2/piston/execute`; set to `/api/execute` for proxy mode).

### Runtime Discovery Flow

```
EditorPage mounts
  │
  ├─► fetch('https://emkc.org/api/v2/piston/runtimes')
  │
  ├─► Success: populate LanguageDropdown with all runtimes
  │            default selection: first 'javascript' or 'python' entry
  │
  └─► Failure: populate LanguageDropdown with FALLBACK_RUNTIMES
               show non-blocking error banner: "Could not load runtimes. Showing defaults."
```

---

## State Management Approach

State is managed at the component level using React hooks — no global state library is needed given the app's limited scope.

### Custom Hooks

| Hook | Responsibility |
|---|---|
| `useCollabEditor(roomId, username, color)` | Creates Y.Doc, WebsocketProvider, awareness state. Returns `{ ydoc, provider }`. Handles cleanup on unmount. |
| `useMonacoBinding(ydoc, editorRef, provider)` | Creates MonacoBinding once both `ydoc` and `editorRef` are available. Destroys on unmount. |
| `usePresence(provider)` | Subscribes to awareness updates. Returns `Map<clientId, AwarenessState>` for PresencePanel rendering. |
| `useRuntimes()` | Fetches Piston runtimes on mount. Returns `{ runtimes, loading, error, selectedRuntime, setSelectedRuntime }`. |
| `useCodeExecution(selectedRuntime)` | Manages execution state. Returns `{ execute(code, stdin), isRunning, output, error }`. |

### Data Flow Diagram

```
sessionStorage
  username, color
       │
       ▼
useCollabEditor ──────────────────────────────► provider.awareness
       │                                              │
       │ ydoc                                         ▼
       ▼                                         usePresence → PresencePanel
useMonacoBinding ─────► MonacoBinding
       │                    │
       │                    ▼ (binds)
       │               Monaco editor model
       │
       ▼
useRuntimes ──────────► LanguageDropdown
                              │
                              ▼ selectedRuntime
                        useCodeExecution ──────► OutputPanel
                              ▲
                         RunButton click / Ctrl+Enter
```

---

## File and Directory Structure

```
/
├── client/
│   ├── package.json           # Vite + React + deps
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx            # ReactDOM.createRoot, BrowserRouter
│       ├── App.jsx             # Routes: / and /room/:roomId
│       ├── pages/
│       │   ├── LandingPage.jsx
│       │   └── EditorPage.jsx
│       ├── components/
│       │   ├── MonacoEditor.jsx
│       │   ├── PresencePanel.jsx
│       │   ├── LanguageDropdown.jsx
│       │   ├── RunButton.jsx
│       │   ├── StdinInput.jsx
│       │   ├── OutputPanel.jsx
│       │   └── TabBar.jsx
│       ├── hooks/
│       │   ├── useCollabEditor.js
│       │   ├── useMonacoBinding.js
│       │   ├── usePresence.js
│       │   ├── useRuntimes.js
│       │   └── useCodeExecution.js
│       ├── utils/
│       │   ├── roomId.js       # nanoid-based Room_ID generation
│       │   ├── colors.js       # User_Color palette + random pick
│       │   └── piston.js       # executeCode(), fetchRuntimes() API wrappers
│       └── styles/
│           └── index.css
│
└── server/
    ├── package.json            # Express + ws + y-websocket + node-fetch
    ├── server.js               # Entry point: HTTP server, mounts relay + routes
    ├── relay.js                # WebSocket upgrade → setupWSConnection
    └── proxy.js                # Optional /api/execute proxy route
```

### Client `package.json` key dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@monaco-editor/react": "^4.6.0",
    "monaco-editor": "^0.47.0",
    "yjs": "^13.6.15",
    "y-websocket": "^1.5.4",
    "y-monaco": "^0.1.6",
    "nanoid": "^5.0.7"
  },
  "devDependencies": {
    "vite": "^5.2.0",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

### Server `package.json` key dependencies

```json
{
  "dependencies": {
    "express": "^4.19.2",
    "ws": "^8.17.0",
    "y-websocket": "^1.5.4",
    "node-fetch": "^3.3.2"
  }
}
```

---

## Error Handling

| Scenario | Handling |
|---|---|
| Empty username on LandingPage | Inline validation error; block navigation |
| Runtimes fetch failure | Fallback list + non-blocking banner in LanguageDropdown area |
| WebSocket disconnect | y-websocket has built-in exponential backoff reconnect (max 2500ms). Monaco stays editable; changes queue locally. |
| Execute request timeout / network error | Display "Execution failed: \<message\>" in OutputPanel; re-enable RunButton |
| Piston HTTP 400 | Display `response.message` in OutputPanel |
| Compile error (non-zero exit + stderr) | Display stderr in red with exit code label |
| Empty output (stdout="" and stderr="") | Display "Program produced no output." |
| User navigates to /room/:roomId directly | EditorPage loads normally; checks sessionStorage for username, if missing redirects to LandingPage |

---

## Testing Strategy

### Unit Tests (Vitest + @testing-library/react)

- **`roomId.js`**: Generated IDs are URL-safe and non-empty.
- **`colors.js`**: Each call returns a valid hex color; subsequent calls within a session return the same color.
- **`piston.js`**: `buildExecuteRequest` produces the correct shape. `parseExecuteResponse` extracts stdout/stderr/code correctly.
- **`LandingPage`**: Empty username shows validation error. Valid username + room navigates correctly.
- **`OutputPanel`**: Renders stdout, stderr (red), exit code. Shows "no output" message when both are empty.
- **`LanguageDropdown`**: Renders fallback runtimes on fetch failure. Updates Monaco language on selection.

### Integration Tests

- Server health-check endpoint returns HTTP 200.
- WebSocket relay broadcasts a Yjs update from one client to another sharing the same room ID.
- Proxy route (`/api/execute`) forwards request to Piston and returns response.

### Property-Based Tests (fast-check)

See Correctness Properties section below for properties. Tests use `fast-check` with a minimum of 100 iterations per property.

Tag format: `// Feature: collab-ide, Property N: <property text>`

Each property is implemented as a single `fc.assert(fc.property(...))` call.

---


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The properties below are derived from the testable acceptance criteria identified in prework analysis. Properties are implemented using the `fast-check` library with a minimum of 100 iterations each.

---

### Property 1: Room ID is always URL-safe and non-empty

*For any* invocation of `generateRoomId()`, the returned string SHALL be non-empty and contain only URL-safe characters (alphanumeric, hyphens, underscores, tildes — no spaces or reserved characters).

**Validates: Requirements 1.3**

---

### Property 2: Blank username is always rejected

*For any* string composed entirely of whitespace characters (including the empty string), submitting it as a Username on the LandingPage SHALL prevent navigation and SHALL not cause any room to be joined or created. The validation state SHALL be an error.

**Validates: Requirements 1.6, 1.7**

---

### Property 3: Y.Text update round-trip

*For any* string inserted into a `Y.Text` instance that is bound to a Monaco editor model via `MonacoBinding`, the Monaco model's value SHALL equal the `Y.Text`'s string value after the update is applied.

**Validates: Requirements 2.3**

---

### Property 4: CRDT merge preserves concurrent edits

*For any* two independent text edits applied to two separate `Y.Doc` instances that start from the same base state, merging the two documents (by exchanging encoded update vectors) SHALL produce a document whose string value contains contributions from both edits — no edit is silently lost.

**Validates: Requirements 2.4**

---

### Property 5: New joiner receives complete document state

*For any* `Y.Doc` state with any text content, a fresh `Y.Doc` that receives the encoded full-state update from the existing document SHALL have an identical `Y.Text` string value after applying the update.

**Validates: Requirements 2.8**

---

### Property 6: Awareness user state round-trip

*For any* username string and hex color string, calling `awareness.setLocalStateField('user', { name, color })` SHALL result in `awareness.getLocalState().user` having the exact same `name` and `color` values.

**Validates: Requirements 3.1**

---

### Property 7: User color is always from the palette

*For any* call to `pickUserColor()` (the color-selection utility), the returned value SHALL be a member of the predefined `USER_COLOR_PALETTE` array and SHALL be a valid 6-digit hex color string (matching `/^#[0-9a-fA-F]{6}$/`).

**Validates: Requirements 3.2**

---

### Property 8: Cursor awareness reflects any Monaco position

*For any* Monaco `IPosition` value `{ lineNumber, column }`, after calling the cursor awareness update handler with that position, `awareness.getLocalState().cursor.anchor` SHALL equal `{ line: lineNumber, character: column }`.

**Validates: Requirements 3.3**

---

### Property 9: PresencePanel renders all connected users

*For any* non-empty `Map<clientId, AwarenessState>` where each entry has a `user` field with `name` and `color`, rendering `<PresencePanel states={map} />` SHALL produce output that contains each user's `name` and a DOM element styled with that user's `color`.

**Validates: Requirements 3.5**

---

### Property 10: Language dropdown always contains minimum required runtimes

*For any* list of `Runtime` objects returned by the Piston API (including the empty list or a list lacking any of the four required languages), the `LanguageDropdown` SHALL always render options for at least JavaScript, Python, C++, and Java.

**Validates: Requirements 4.2**

---

### Property 11: Language dropdown renders name and version for every runtime

*For any* non-empty array of `Runtime` objects, rendering `<LanguageDropdown runtimes={runtimes} />` SHALL produce output where each runtime's `language` string and `version` string both appear as visible text.

**Validates: Requirements 4.4**

---

### Property 12: Monaco language mode matches selected runtime

*For any* `Runtime` selected in the `LanguageDropdown`, after the selection change event fires, `monaco.editor.getModel().getLanguageId()` SHALL return the language identifier that corresponds to the selected runtime's `language` field.

**Validates: Requirements 4.5**

---

### Property 13: Execute request always conforms to Piston v2 schema

*For any* combination of a non-empty code string, a valid `Runtime` object, and a stdin string (including empty), `buildExecuteRequest(code, runtime, stdin)` SHALL return an object that:
- has a `language` field equal to `runtime.language`
- has a `version` field equal to `runtime.version`
- has a `files` array containing exactly one object with a `content` field equal to `code`
- has a `stdin` field equal to the provided stdin string

**Validates: Requirements 5.1, 5.2**

---

### Property 14: OutputPanel renders all result fields for any response

*For any* `ExecuteResponse` with arbitrary `run.stdout`, `run.stderr`, and `run.code` values, rendering `<OutputPanel result={response} />` SHALL:
- display the `stdout` content as visible text
- display the `stderr` content styled in red
- display the numeric exit code with a label

**Validates: Requirements 5.4, 5.8**

---
