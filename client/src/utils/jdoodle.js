/**
 * jdoodle.js — JDoodle Compiler API client utilities
 *
 * Replaces the old judge0.js. Calls go through the server proxy at /api/execute
 * to keep the JDoodle clientId/clientSecret server-side only.
 *
 * Flow (synchronous — no polling):
 *   1. POST /api/execute with { language, version, files:[{content}], stdin }
 *   2. Proxy maps our language key → JDoodle language code + versionIndex,
 *      injects credentials, and forwards to https://api.jdoodle.com/v1/execute
 *   3. JDoodle responds in a single request with { output, statusCode, memory, cpuTime }
 *
 * JDoodle has NO separate stderr field — compile and runtime errors come back
 * inside `output` itself. So the OutputPanel distinguishes normal output from
 * errors/timeouts heuristically via isErrorOutput() / isTimeoutOutput() below.
 */

const EXECUTE_URL = '/api/execute'

/**
 * Map our language key to Monaco editor language ID.
 */
export const MONACO_LANG_MAP = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  'c++': 'cpp',
  cpp: 'cpp',
  c: 'c',
  java: 'java',
  rust: 'rust',
  go: 'go',
  ruby: 'ruby',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  csharp: 'csharp',
  'c#': 'csharp',
  bash: 'shell',
  shell: 'shell',
}

/**
 * Fallback runtimes used for the language dropdown.
 * These are the 4 required languages from the spec. Versions are display-only;
 * the actual JDoodle language code + versionIndex live in the proxy's LANGUAGE_MAP.
 */
export const FALLBACK_RUNTIMES = [
  { language: 'python', version: '3', label: 'Python 3', monacoLang: 'python' },
  { language: 'javascript', version: 'Node', label: 'JavaScript (Node.js)', monacoLang: 'javascript' },
  { language: 'c++', version: 'C++17', label: 'C++', monacoLang: 'cpp' },
  { language: 'java', version: 'OpenJDK', label: 'Java', monacoLang: 'java' },
]

/**
 * Required language keys (must always appear in dropdown).
 */
const REQUIRED_LANGUAGE_KEYS = ['python', 'javascript', 'c++', 'java']

/**
 * Build the request body for the proxy.
 *
 * The wire shape ({ language, version, files, stdin }) is deliberately unchanged
 * from the previous backend — the proxy is responsible for translating `language`
 * into JDoodle's language code + versionIndex.
 *
 * @param {string} code
 * @param {{ language: string, version: string, monacoLang: string }} runtime
 * @param {string} stdin
 * @returns {{ language: string, version: string, files: [{content: string}], stdin: string }}
 */
export function buildExecuteRequest(code, runtime, stdin) {
  return {
    language: runtime.language,
    version: runtime.version,
    files: [{ content: code }],
    stdin: stdin ?? '',
  }
}

/**
 * Execute code via the proxy (single synchronous request — no polling).
 *
 * Returns a normalized JDoodle result:
 *   { output: string, statusCode: number|null, memory: string|null, cpuTime: string|null }
 *
 * @param {{ language: string, version: string, files: [{content: string}], stdin: string }} request
 * @returns {Promise<{ output: string, statusCode: number|null, memory: string|null, cpuTime: string|null }>}
 */
export async function executeCode(request) {
  const res = await fetch(EXECUTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    // Proxy/JDoodle-level failure: unsupported language (400), bad credentials
    // (401), daily credit limit reached (429), upstream error (502), etc.
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? err.error ?? `Execution failed: ${res.status}`)
  }

  const data = await res.json()
  return normalizeResult(data)
}

/**
 * Normalize a raw JDoodle response into a null-safe shape for the UI.
 * @param {object} data - Raw JDoodle response { output, statusCode, memory, cpuTime }
 * @returns {{ output: string, statusCode: number|null, memory: string|null, cpuTime: string|null }}
 */
function normalizeResult(data) {
  return {
    output: data?.output ?? '',
    statusCode: data?.statusCode ?? null,
    memory: data?.memory ?? null,
    cpuTime: data?.cpuTime ?? null,
  }
}

/**
 * Heuristic: does this JDoodle output text look like a compile/runtime error?
 *
 * JDoodle has no stderr channel — errors are interleaved into `output`. There is
 * no perfectly reliable way to classify this, so we match common cross-language
 * error signatures. Used by OutputPanel to decide whether to render output in the
 * error (red) style. Timeouts are handled separately by isTimeoutOutput().
 *
 * @param {string} output
 * @returns {boolean}
 */
export function isErrorOutput(output) {
  if (!output) return false
  if (isTimeoutOutput(output)) return false
  return ERROR_SIGNATURES.some((re) => re.test(output))
}

const ERROR_SIGNATURES = [
  /traceback \(most recent call last\)/i, // Python
  /\bsyntaxerror\b/i,                      // Python/JS
  /\b\w*error\b\s*:/i,                     // "error:", "TypeError:", "ReferenceError:"
  /\bexception\b/i,                        // Java/C#/Ruby
  /\bpanic:/i,                             // Go/Rust
  /segmentation fault/i,                   // C/C++
  /cannot find symbol/i,                   // Java
  /undefined reference/i,                  // C/C++ linker
  /compilation (failed|error|terminated)/i,
  /\bfatal error\b/i,                      // C/C++/GCC
]

/**
 * Heuristic: did JDoodle kill this run for exceeding its execution time limit?
 *
 * JDoodle enforces its own per-run CPU/wall-clock limit (free tier) and returns a
 * message inside `output` when a program runs too long (e.g. an infinite loop).
 * We match its documented phrasing plus generic timeout wording.
 *
 * @param {string} output
 * @returns {boolean}
 */
export function isTimeoutOutput(output) {
  if (!output) return false
  return TIMEOUT_SIGNATURES.some((re) => re.test(output))
}

const TIMEOUT_SIGNATURES = [
  /taking too long to execute/i, // JDoodle's documented message
  /\btime\s*limit\b/i,
  /\btimed?\s*out\b/i,
]

/**
 * Return the fallback runtime list (dropdown has no live fetch — languages are
 * fixed by the proxy's LANGUAGE_MAP).
 */
export async function fetchRuntimes() {
  return FALLBACK_RUNTIMES
}

/**
 * Ensure the four required languages are present.
 */
export function ensureRequiredRuntimes(runtimes) {
  const present = new Set(runtimes.map((r) => r.language.toLowerCase()))
  const missing = FALLBACK_RUNTIMES.filter((fb) => !present.has(fb.language.toLowerCase()))
  return [...runtimes, ...missing]
}

/**
 * Get Monaco language ID for a given language key.
 */
export function getMonacoLang(language) {
  return MONACO_LANG_MAP[language?.toLowerCase()] ?? language?.toLowerCase() ?? 'plaintext'
}

/**
 * Get filename for a given language (used by the cosmetic TabBar).
 */
export function getFilename(language) {
  const extensions = {
    python: 'main.py',
    javascript: 'index.js',
    typescript: 'index.ts',
    'c++': 'main.cpp',
    cpp: 'main.cpp',
    c: 'main.c',
    java: 'Main.java',
    rust: 'main.rs',
    go: 'main.go',
    ruby: 'main.rb',
    php: 'index.php',
    swift: 'main.swift',
    kotlin: 'main.kt',
    csharp: 'Program.cs',
    'c#': 'Program.cs',
    bash: 'script.sh',
    shell: 'script.sh',
  }
  return extensions[language?.toLowerCase()] ?? 'code.txt'
}
