# CollabIDE

A real-time collaborative code editor with live execution. Multiple people edit
the same file simultaneously — with live cursors and presence — then run the code
and see real output. Not a mock: code is executed by
[JDoodle](https://www.jdoodle.com/) and the output is real.

> Single shared file per room. Multi-file, auth, and persistence are explicit
> non-goals (see [Scope](#scope)).

---

## Features

- **Real-time collaboration** — Yjs CRDT sync over WebSockets; concurrent edits
  merge without conflicts, no central arbiter.
- **Live presence** — per-user colors, names, and live remote cursors/selections
  rendered inside Monaco via the Yjs awareness protocol.
- **Real execution** — Python, JavaScript, C++, and Java (plus more) run on
  JDoodle with stdin support, plus error and timeout detection.
- **IDE feel** — Monaco editor, VS Code dark theme, split editor/output panes,
  a filename tab, language dropdown, and a `Ctrl/Cmd+Enter` run shortcut.

---

## Architecture

```
┌──────────────────────────── Browser (React + Vite) ────────────────────────────┐
│                                                                                  │
│   LandingPage ──▶ /room/:roomId ──▶ EditorPage                                   │
│                                       │                                          │
│     ┌─────────────────────────────────┼───────────────────────────────────┐    │
│     │ Monaco editor        useCollabEditor ── Y.Doc  ◀── y-monaco binding   │    │
│     │ (y-monaco)                        │                                   │    │
│     │ live cursors ◀── usePresence ── awareness                            │    │
│     │ Run ▶ ─── useCodeExecution ── utils/jdoodle.js (single request)       │    │
│     └───────────────┬───────────────────────────────┬───────────────────────┘  │
│                     │ WebSocket (Yjs sync +          │ HTTP  POST /api/execute   │
│                     │ awareness)                     │                           │
└─────────────────────┼───────────────────────────────┼──────────────────────────┘
                      │                               │
        ┌─────────────▼───────────────┐   ┌───────────▼──────────────────────────┐
        │  Yjs relay (relay.js)        │   │  Express proxy (proxy.js)             │
        │  y-websocket setupWSConnection│   │  injects clientId/secret (server-only)│
        │  room = docName, pure relay   │   │  maps lang → JDoodle code + version   │
        └──────────────────────────────┘   └───────────────┬───────────────────────┘
                      ▲                                     │
        both share one Node HTTP server (server.js)         ▼
                                                    ┌──────────────────────┐
                                                    │  JDoodle Compiler API │
                                                    │  sandboxed execution   │
                                                    └──────────────────────┘
```

- The **WebSocket relay** is a dumb pipe: it never inspects or stores document
  content. All CRDT conflict resolution happens client-side in Yjs. Room
  isolation is achieved by using the room ID as the Yjs `docName`.
- The **execution proxy** exists solely to keep the JDoodle credentials
  (clientId + clientSecret) server-side. The browser never sees them. JDoodle is
  synchronous — one request in, one result out — so the proxy is a single POST
  endpoint (no polling). It also translates our language keys into JDoodle's
  language codes + version indices.

> **A note on error output:** JDoodle returns a single combined `output` string —
> there is no separate stderr channel. Compile errors, runtime stack traces, and
> the "taking too long to execute" timeout message all arrive inside `output`. So
> [`utils/jdoodle.js`](client/src/utils/jdoodle.js) classifies the text
> heuristically (`isErrorOutput` / `isTimeoutOutput`) and the OutputPanel renders
> it as normal output, a red error, or a timeout notice accordingly.

### Why Yjs (CRDT) instead of Operational Transform (OT)?

CRDTs guarantee that any two clients which receive the same set of edits converge
to the same document, regardless of the order those edits arrive — so correctness
does not depend on a central server sequencing operations. That let me build the
server as a **stateless relay** rather than an OT authority that has to hold
canonical state, transform every incoming operation against concurrent ones, and
become both a scaling bottleneck and a single point of failure. OT's transform
functions are also notoriously subtle to get right across every edit-type pairing,
whereas Yjs's CRDT (a YATA variant) handles concurrent insertions deterministically
with well-tested library code and offline-friendly merging. The trade-off is memory
overhead per character for CRDT metadata, which is a non-issue at the scale of a
collaborative code buffer. For a real-time editor where I wanted a thin backend and
strong convergence guarantees, Yjs was the clear choice.

---

## Tech stack

| Layer        | Choice                                                    |
| ------------ | --------------------------------------------------------- |
| Frontend     | React 18, Vite, React Router                              |
| Editor       | Monaco (`@monaco-editor/react`)                           |
| Collaboration| Yjs, `y-monaco`, `y-websocket`                            |
| Backend      | Node, Express, `ws`, `y-websocket` relay                  |
| Execution    | JDoodle Compiler API (server-side proxy)                  |
| Tests        | Vitest + Testing Library + fast-check (property-based)    |

---

## Local development

Requires Node 18+.

### 1. Server

```bash
cd server
npm install
cp .env.example .env        # then edit .env (see below)
npm run dev                 # http://localhost:1234  (WS relay + /api/execute)
```

### 2. Client

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

Open two browser tabs on the same `/room/:roomId` URL to see live collaboration.

### Environment variables

**Server** (`server/.env`):

| Variable                 | Required | Description                                                            |
| ------------------------ | -------- | ---------------------------------------------------------------------- |
| `JDOODLE_CLIENT_ID`      | yes\*    | JDoodle client ID from [JDoodle](https://www.jdoodle.com/compiler-api). Free tier: 200 credits/day, no card required. |
| `JDOODLE_CLIENT_SECRET`  | yes\*    | JDoodle client secret (paired with the client ID).                    |
| `PORT`                   | no       | Defaults to `1234`.                                                    |

\* The app loads and collaboration works without them, but **Run** will fail with
a "Server missing JDoodle credentials" message until both are set. These are the
only things you must provide to exercise execution.

**Client** (`client/.env`, all optional):

| Variable          | Description                                                          |
| ----------------- | ------------------------------------------------------------------- |
| `VITE_WS_URL`     | WebSocket URL of the server relay. Defaults to `ws://localhost:1234`. Set to `wss://<your-server>` in production. |

> The client calls the execution proxy at the relative path `/api/execute`, so in
> production the client's requests to `/api/*` must reach the server (via a
> rewrite/proxy — see deploy below).

---

## Testing

```bash
cd client
npm test        # vitest run — 42 tests, incl. property-based (fast-check) + JDoodle flow
```

The JDoodle execution flow is covered by `src/tests/jdoodle.test.js` with a mocked
`fetch` against real JDoodle response shapes for three scenarios: **stdin input**,
a **compile/syntax error**, and an **infinite-loop timeout** — plus the
`isErrorOutput` / `isTimeoutOutput` classifiers. No credentials are needed to run
the tests.

---

## Deployment

The client (static) and server (long-lived WebSocket + proxy) deploy separately.

### Server → Render

1. New **Web Service** from this repo, root directory `server`.
2. Build command: `npm install` · Start command: `npm start`.
3. Add env vars `JDOODLE_CLIENT_ID` and `JDOODLE_CLIENT_SECRET`. (`PORT` is provided by Render automatically.)
4. Note the service URL, e.g. `https://collab-ide-server.onrender.com`.

Render supports WebSockets on the same port, so the Yjs relay and `/api/execute`
proxy are both served from this one service.

### Client → Vercel

1. New project from this repo, root directory `client`.
2. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. Add env var `VITE_WS_URL = wss://collab-ide-server.onrender.com`.
4. Route `/api/*` to the server by adding a `vercel.json` in `client/`:

   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://collab-ide-server.onrender.com/api/:path*" }
     ]
   }
   ```

   This keeps the JDoodle credentials server-side: the browser only ever calls
   `/api/execute` on its own origin, which Vercel forwards to Render.

---

## Scope

**In scope:** real-time multi-user editing of a single shared file per room,
presence/cursors, and real code execution.

**Non-goals (intentionally not built):** authentication, multi-file / folder
support, persistent storage (rooms are in-memory and ephemeral), and chat/video.

---

## Notes

- Execution uses the **JDoodle Compiler API**. It was chosen for a zero-cost free
  tier (200 credits/day, no card required) and a simple synchronous request/response
  — no submit-then-poll. Auth is a clientId + clientSecret pair, kept server-side in
  the Express proxy; the browser never sees them.
- The `TabBar` is a deliberately cosmetic single-file tab (it shows the filename
  for the selected language, e.g. `main.py`), consistent with the single-file scope.
