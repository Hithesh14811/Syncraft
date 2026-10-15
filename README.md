# Syncraft

Syncraft is a collaborative code editor that runs in the browser. You create a room, send the link to a friend, and you both type in the same file at the same time. You can see each other's cursors, and when you hit Run the code actually executes and you both get the real output back.

**Try it: [syncraft-eight.vercel.app](https://syncraft-eight.vercel.app)**. Create a room, then open the same link in a second tab or send it to someone.

The server runs on Render's free tier, so if nobody has used it for a while it's asleep and the first load can take up to a minute. If the editor doesn't sync right away, give it a moment.

I built it because most "collaborative editor" demos stop at syncing text. I wanted the whole loop: edit together, run together, see the same result.

## What it does

- **Live editing.** Edits merge in real time, even when two people type on the same line at once. Nothing gets overwritten.
- **Presence.** Everyone gets a color and a name. You can see who's in the room and where their cursor is, with a little name tag on it.
- **Real execution.** Python, JavaScript, C++ and Java run through the JDoodle compiler API. Stdin is supported, and compile errors and infinite loops are shown as errors and timeouts instead of just dumping text.
- **Shared language.** If one person switches the room to Java, everyone switches with them, so you're never running someone else's code with the wrong compiler.
- **Feels like an IDE.** Monaco (the editor inside VS Code), dark theme, a filename tab, an output panel, and Ctrl/Cmd+Enter to run.

## How it works

```
 Browser (React + Vite)                         Node server
 ┌───────────────────────────┐   WebSocket    ┌───────────────────────────┐
 │ Monaco  <->  Yjs document │ <------------> │ y-websocket relay         │
 │ cursors via Yjs awareness │                │ (one doc per room)        │
 │                           │   POST /api/   │                           │
 │ Run button  ──────────────│ ----execute--> │ Express proxy ──> JDoodle │
 └───────────────────────────┘                └───────────────────────────┘
```

**Syncing.** The document is a Yjs CRDT. Every client keeps its own copy, and Yjs guarantees that everyone who has seen the same edits ends up with the same text, no matter what order the edits arrived in. Because of that, the server doesn't have to be smart. It just relays updates between everyone in a room. The room ID in the URL is the document name, which is all the isolation between rooms needs.

I went with a CRDT instead of operational transform (what Google Docs historically used) mostly because of that last point. With OT the server has to own the document and transform every operation against every concurrent one, and getting those transforms right for every case is hard. With Yjs the merging happens on the clients using a well-tested library, and the server stays a thin relay. The cost is some extra memory per character, which doesn't matter for a code file.

**Running code.** The browser never talks to JDoodle directly, because that would mean shipping my API keys to every visitor. Instead it posts to `/api/execute` on my server, which adds the credentials and forwards the request. Each run costs a JDoodle credit (200 a day on the free tier), so the endpoint is rate-limited per IP and rejects huge payloads.

JDoodle sends back stdout and errors in one combined string, so the client uses a few patterns (Python tracebacks, `error:` lines, segfaults, JDoodle's timeout message and so on) to decide whether to show the result as normal output, an error or a timeout.

## Running it locally

You need Node 18 or newer.

**Server**

```bash
cd server
npm install
cp .env.example .env   # add your JDoodle client ID and secret
npm run dev            # http://localhost:1234
```

**Client**

```bash
cd client
npm install
npm run dev            # http://localhost:5173
```

Open the same room URL in two tabs and start typing. If you open a room link before picking a display name, you land on the home page with the room ID already filled in.

### Environment variables

Server (`server/.env`):

| Variable | Needed? | What it's for |
| --- | --- | --- |
| `JDOODLE_CLIENT_ID` | for Run | Get one free at [jdoodle.com/compiler-api](https://www.jdoodle.com/compiler-api) |
| `JDOODLE_CLIENT_SECRET` | for Run | Goes with the client ID |
| `PORT` | no | Defaults to `1234` |
| `EXECUTE_RATE_LIMIT` | no | Runs per IP per minute, defaults to `10` |

Editing and presence work without the JDoodle keys. Only the Run button needs them.

Client (`client/.env`, optional):

- `VITE_WS_URL` is the WebSocket address of the server. It defaults to `ws://localhost:1234`.
- `VITE_API_URL` is the server's base URL for running code. Leave it empty when `/api` is proxied (the Vite dev server and Vercel both do that), and set it when the client is hosted as plain static files.

## Tests

```bash
cd client
npm test
```

There are 45 tests (Vitest + Testing Library). A few are property-based tests with fast-check, for example checking that merging two independent edits keeps both, that a fresh document synced from another ends up identical, and that blank usernames are always rejected. The JDoodle flow is tested against real response shapes for stdin, a compile error and an infinite loop, so no API keys are needed.

## Deploying

The client and server deploy separately, since the server has to hold long-lived WebSocket connections.

- **Server on Render.** New web service, root directory `server`, start command `npm start`, and add the two JDoodle variables. Render supports WebSockets on the same port, so the relay and the API live in one service.
- **Client on Vercel** (how the live demo runs). Root directory `client`, Vite preset, and set `VITE_WS_URL` to `wss://<your-render-service>`. `client/vercel.json` forwards `/api/*` to the Render service, so the browser only ever calls its own origin and `VITE_API_URL` isn't needed.
- **Or the client as a Render static site.** Build command `cd client && npm ci && npm run build && cp dist/index.html dist/404.html`, publish directory `client/dist`. Set `VITE_WS_URL` to `wss://<your-render-service>` and `VITE_API_URL` to `https://<your-render-service>`. Copying `index.html` to `404.html` makes room links work when you open them directly.

## Scope

Each room is a single shared file. I left out accounts, multiple files and saving rooms on purpose to keep the focus on real-time sync and execution. Rooms live in memory and disappear when everyone leaves.
