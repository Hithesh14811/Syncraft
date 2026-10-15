import { describe, it, expect } from 'vitest'
import { buildCursorCss } from '../components/RemoteCursorStyles.jsx'

describe('buildCursorCss', () => {
  it('styles every remote user and skips the local client', () => {
    const states = new Map([
      [1, { user: { name: 'Me', color: '#2196f3' } }],
      [2, { user: { name: 'Alice', color: '#e91e63' } }],
    ])
    const css = buildCursorCss(states, 1)
    expect(css).toContain('.yRemoteSelection-2')
    expect(css).toContain('.yRemoteSelectionHead-2')
    expect(css).toContain('#e91e63')
    expect(css).toContain('"Alice"')
    expect(css).not.toContain('.yRemoteSelection-1 ')
  })

  it('ignores users with missing or non-hex colors', () => {
    const states = new Map([
      [2, { user: { name: 'x', color: 'red; } body { display:none' } }],
      [3, {}],
    ])
    expect(buildCursorCss(states, 1)).toBe('')
  })

  it('escapes names so they cannot break out of the CSS string', () => {
    const states = new Map([[2, { user: { name: '"} body {', color: '#4caf50' } }]])
    expect(buildCursorCss(states, 1)).toContain('content: "\\"} body {"')
  })
})
