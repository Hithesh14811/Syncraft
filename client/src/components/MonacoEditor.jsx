/**
 * MonacoEditor.jsx — Monaco editor wrapper component
 *
 * Wraps @monaco-editor/react with IDE-like defaults:
 *   - Dark VS Code theme (vs-dark)
 *   - Line numbers enabled
 *   - Bracket pair colorization
 *   - Basic IntelliSense/autocomplete (Monaco's built-in, not a custom server)
 *
 * The onMount callback gives the parent access to the editor and monaco
 * instances needed by useMonacoBinding and the Ctrl+Enter shortcut.
 */

import Editor from '@monaco-editor/react'

/**
 * @param {{
 *   language: string,
 *   onMount: (editor: any, monaco: any) => void,
 *   height?: string,
 * }} props
 */
export default function MonacoEditor({ language = 'python', onMount, height = '100%' }) {
  return (
    <Editor
      height={height}
      language={language}
      theme="vs-dark"
      onMount={onMount}
      options={{
        // IDE essentials
        lineNumbers: 'on',
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        fontLigatures: true,

        // Bracket matching & colorization
        bracketPairColorization: { enabled: true },
        matchBrackets: 'always',

        // IntelliSense — use Monaco's built-in word-based completions
        quickSuggestions: true,
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
        wordBasedSuggestions: 'currentDocument',

        // Editor feel
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line',
        cursorBlinking: 'smooth',
        smoothScrolling: true,
        padding: { top: 8, bottom: 8 },
      }}
    />
  )
}
