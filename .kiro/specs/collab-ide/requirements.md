# Requirements Document

## Introduction

CollabIDE is a web-based real-time collaborative code editor that allows multiple users to simultaneously edit the same file, see each other's cursors, and execute code with live output. It functions as a lightweight online IDE — not merely a shared text box — with room-based access, no authentication, and direct code execution via the Piston API.

The system consists of a React/Vite frontend (using Monaco Editor, Yjs CRDT, and y-websocket) and a thin Node.js/Express/WebSocket relay server. Code execution requests are made client-side to the Piston API.

## Glossary

- **CollabIDE**: The full application, comprising the Client and the Server.
- **Client**: The React/Vite frontend application served to the browser.
- **Server**: The Node.js/Express backend that runs the WebSocket relay.
- **WebSocket_Relay**: The thin y-websocket relay component within the Server responsible for broadcasting Yjs document updates between connected peers.
- **Room**: A collaborative editing session identified by a unique Room_ID.
- **Room_ID**: A randomly generated string that uniquely identifies a Room and acts as the sole access control mechanism.
- **User**: A browser session participant who has entered a username and joined a Room.
- **Username**: A display name provided by the User on the landing page before joining a Room.
- **User_Color**: A randomly assigned hex color associated with a User for cursor and presence display.
- **Landing_Page**: The root route (`/`) where Users create or join a Room.
- **Editor_Page**: The route `/room/:roomId` that renders the collaborative editor for a given Room.
- **Monaco**: The Monaco Editor component embedded in the Editor_Page, providing syntax highlighting, IntelliSense, bracket matching, and line numbers.
- **Yjs_Document**: The shared CRDT document (Y.Doc) that holds the collaborative text state for a Room.
- **WebSocket_Provider**: The `WebsocketProvider` from `y-websocket` that synchronizes the Yjs_Document between all Users in a Room over WebSockets.
- **Monaco_Binding**: The `MonacoBinding` from `y-monaco` that binds the Yjs_Document text to the Monaco editor model.
- **Awareness**: The Yjs awareness protocol used to share ephemeral state (cursor position, selection, Username, User_Color) between Users in a Room.
- **Cursor**: The remote User's caret position and selection range rendered inside Monaco in that User's User_Color.
- **Presence_Panel**: The connected-users list displayed in the header showing each User's Username and User_Color dot.
- **Piston_API**: The external code execution service at `https://emkc.org/api/v2/piston`.
- **Runtime**: A language/version pair supported by the Piston_API (e.g., Python 3.10, Node.js 18).
- **Language_Dropdown**: The UI control that lists available Runtimes and allows the User to select one.
- **Run_Button**: The UI button that triggers code execution.
- **Stdin_Input**: The text input field where the User provides standard input for the program.
- **Output_Panel**: The terminal-style panel that displays stdout, stderr, and exit code from code execution.
- **Execute_Request**: The HTTP POST sent to the Piston_API `/execute` endpoint with the language, version, files, and stdin.
- **Execute_Response**: The JSON response from the Piston_API containing stdout, stderr, and exit code.
- **Proxy_Route**: An optional Express route `/api/execute` on the Server that forwards Execute_Requests to the Piston_API to avoid browser CORS restrictions.
- **VITE_WS_URL**: An environment variable on the Client that configures the WebSocket connection URL, defaulting to `ws://localhost:1234`.

---

## Requirements

### Requirement 1: Room Creation and Navigation

**User Story:** As a User, I want to create a new Room or join an existing one from the Landing_Page, so that I can start or continue a collaborative editing session.

#### Acceptance Criteria

1. THE Client SHALL serve the Landing_Page at the `/` route.
2. THE Client SHALL serve the Editor_Page at the `/room/:roomId` route.
3. WHEN a User clicks "Create Room" on the Landing_Page, THE Client SHALL generate a random Room_ID and navigate the User to `/room/:roomId`.
4. WHEN a User submits a Room_ID on the Landing_Page, THE Client SHALL navigate the User to `/room/:roomId` corresponding to that Room_ID.
5. WHEN a User navigates directly to `/room/:roomId` via URL, THE Client SHALL load the Editor_Page for that Room_ID without redirecting to the Landing_Page.
6. THE Landing_Page SHALL require the User to enter a Username before creating or joining a Room.
7. IF the User submits an empty Username, THEN THE Landing_Page SHALL display a validation error and prevent navigation to the Editor_Page.

---

### Requirement 2: Real-Time Collaborative Editing

**User Story:** As a User, I want my edits to appear instantly in every other User's editor in the same Room, so that we can collaborate on code without refresh or manual sync.

#### Acceptance Criteria

1. THE Client SHALL initialize a Yjs_Document and a WebSocket_Provider for each Room session, connecting to the URL specified by VITE_WS_URL.
2. THE Client SHALL bind the Yjs_Document to the Monaco editor model using a Monaco_Binding.
3. WHEN a User types in Monaco, THE Monaco_Binding SHALL apply the change to the Yjs_Document, and THE WebSocket_Provider SHALL propagate the update to all other Users in the same Room within 500ms under normal network conditions.
4. WHEN the WebSocket_Provider receives a Yjs_Document update from the Server, THE Monaco_Binding SHALL apply it to the Monaco editor model without overwriting concurrent local edits.
5. THE Client SHALL delegate all conflict resolution to the Yjs_Document CRDT — THE Client SHALL NOT implement custom merge logic.
6. THE Server's WebSocket_Relay SHALL forward Yjs_Document update messages between all WebSocket connections sharing the same Room_ID.
7. THE WebSocket_Relay SHALL NOT persist Yjs_Document state to disk or a database.
8. WHEN a User joins a Room that already has content, THE WebSocket_Provider SHALL synchronize the full current Yjs_Document state to the new User's editor before the User begins editing.

---

### Requirement 3: User Presence and Live Cursors

**User Story:** As a User, I want to see the cursors and selections of other Users in real time inside the editor, so that I know where my collaborators are working.

#### Acceptance Criteria

1. WHEN a User joins a Room, THE Client SHALL set the Awareness local state with the User's Username and User_Color using `provider.awareness.setLocalStateField('user', { name, color })`.
2. THE Client SHALL assign each User a unique User_Color from a predefined palette at session start; the User_Color SHALL remain constant for the duration of the session.
3. WHEN a User's cursor position or selection changes in Monaco, THE Client SHALL update the Awareness local state with the new cursor position and selection range.
4. WHEN the Awareness state of a remote User changes, THE Client SHALL render that User's Cursor inside Monaco using the remote User's User_Color.
5. THE Presence_Panel in the Editor_Page header SHALL display the Username and User_Color dot for every User currently connected to the Room.
6. WHEN a User disconnects from the Room, THE Client SHALL remove that User's Cursor from Monaco and remove the User from the Presence_Panel within 5 seconds.

---

### Requirement 4: Runtime Discovery

**User Story:** As a User, I want to select from all languages supported by the Piston_API, so that I can execute code in my preferred language.

#### Acceptance Criteria

1. WHEN the Editor_Page loads, THE Client SHALL fetch the list of available Runtimes from `https://emkc.org/api/v2/piston/runtimes`.
2. THE Language_Dropdown SHALL populate with at minimum the following Runtimes: JavaScript (Node.js), Python 3, C++, and Java — plus any additional Runtimes returned by the Piston_API.
3. WHEN the Piston_API runtimes fetch fails, THE Client SHALL display an error message in the Language_Dropdown area and populate it with the four minimum Runtimes as a fallback.
4. THE Language_Dropdown SHALL display each Runtime's language name and version to the User.
5. WHEN the User changes the selected Runtime in the Language_Dropdown, THE Monaco SHALL update its syntax highlighting language mode to match the selected Runtime's language.

---

### Requirement 5: Code Execution

**User Story:** As a User, I want to run the code in the editor and see the real output, so that I can verify my code works without leaving CollabIDE.

#### Acceptance Criteria

1. WHEN the User clicks the Run_Button, THE Client SHALL send an Execute_Request to the Piston_API with the current editor content, the selected Runtime's language and version, a files array containing the editor content as a single file, and the contents of the Stdin_Input.
2. THE Execute_Request body SHALL conform to the Piston_API v2 schema: `{ language, version, files: [{ content }], stdin }`.
3. WHILE an Execute_Request is pending, THE Run_Button SHALL display a loading indicator and SHALL be disabled to prevent duplicate submissions.
4. WHEN an Execute_Response is received, THE Output_Panel SHALL display the stdout content, the stderr content in visually distinct (red) styling, and the numeric exit code.
5. WHEN the Execute_Response stdout is empty and stderr is empty, THE Output_Panel SHALL display a message indicating that the program produced no output.
6. IF the Execute_Request returns an HTTP error status, THEN THE Client SHALL display a descriptive error message in the Output_Panel.
7. WHEN the User presses Ctrl+Enter (Windows/Linux) or Cmd+Enter (macOS), THE Client SHALL trigger code execution as if the Run_Button was clicked.
8. IF the Piston_API indicates a compilation error via non-zero exit code and non-empty stderr, THEN THE Output_Panel SHALL display the stderr content in red styling with the exit code clearly labeled.
9. THE Client SHALL provide a Stdin_Input field where the User can enter multi-line standard input to pass to the executed program.

---

### Requirement 6: IDE Layout and Editor Configuration

**User Story:** As a User, I want the editor to feel like a real IDE, so that I can write code comfortably with familiar features and a professional layout.

#### Acceptance Criteria

1. THE Editor_Page layout SHALL allocate approximately 70% of the vertical space to the Monaco editor pane and approximately 30% to the Output_Panel.
2. THE Monaco editor SHALL be configured with line numbers enabled, bracket matching enabled, and built-in autocomplete/IntelliSense enabled.
3. THE Monaco editor SHALL use a dark, VS Code-like theme.
4. THE Output_Panel SHALL use a monospace font and a dark background to resemble a terminal.
5. THE Editor_Page SHALL display a file name/tab bar element above the Monaco editor.
6. THE Client SHALL set Monaco's language mode to match the currently selected Runtime whenever the Language_Dropdown selection changes.

---

### Requirement 7: WebSocket Server

**User Story:** As a developer, I want a thin WebSocket relay server, so that Yjs document updates are broadcast between all clients in a Room without storing any code or state server-side.

#### Acceptance Criteria

1. THE Server SHALL expose a WebSocket endpoint using the `ws` library and the `y-websocket/bin/utils` sync logic.
2. THE WebSocket_Relay SHALL route Yjs_Document update messages only to WebSocket connections that share the same Room_ID.
3. THE Server SHALL expose an HTTP health-check endpoint that returns HTTP 200 to confirm the Server is running.
4. THE Server SHALL listen on a configurable port, defaulting to port `1234`.
5. THE WebSocket_Relay SHALL NOT inspect, transform, or store the content of Yjs_Document update messages.
6. WHERE a `/api/execute` Proxy_Route is required to avoid CORS restrictions, THE Server SHALL forward Execute_Requests received at `/api/execute` to `https://emkc.org/api/v2/piston/execute` and return the Execute_Response to the Client.

---

### Requirement 8: Environment Configuration

**User Story:** As a developer, I want the WebSocket URL to be environment-configurable, so that I can deploy the Client and Server to different hosts without changing source code.

#### Acceptance Criteria

1. THE Client SHALL read the WebSocket server URL from the `VITE_WS_URL` environment variable at build time.
2. IF `VITE_WS_URL` is not set, THEN THE Client SHALL default the WebSocket URL to `ws://localhost:1234`.
3. THE Client source code SHALL NOT contain a hardcoded WebSocket URL.

---

### Requirement 9: Project Structure

**User Story:** As a developer, I want a clear project structure separating client and server, so that each can be developed, deployed, and scaled independently.

#### Acceptance Criteria

1. THE CollabIDE source SHALL be organized with all frontend code under a `/client` directory and all backend code under a `/server` directory.
2. THE `/client` directory SHALL contain a Vite + React project with its own `package.json`.
3. THE `/server` directory SHALL contain a Node.js project with its own `package.json`.
