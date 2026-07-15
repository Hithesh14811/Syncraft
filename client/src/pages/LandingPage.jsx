/**
 * LandingPage.jsx — Room creation and join screen
 *
 * Users enter their display name here before entering a room.
 * The username and a randomly assigned color are stored in sessionStorage
 * so they persist through navigations within the same tab.
 *
 * Two flows:
 *   1. Create Room — generates a random Room_ID and navigates to /room/:id
 *   2. Join Room   — takes a typed Room_ID and navigates to /room/:id
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateRoomId } from '../utils/roomId.js'
import { pickUserColor } from '../utils/colors.js'

export default function LandingPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [joinRoomId, setJoinRoomId] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [joinError, setJoinError] = useState('')

  /**
   * Validate and persist the session state, then navigate to the room.
   * @param {string} roomId
   * @returns {boolean} whether navigation should proceed
   */
  function enterRoom(roomId) {
    // Validate username — must be non-empty after trimming whitespace
    if (!username.trim()) {
      setUsernameError('Please enter a display name before joining.')
      return false
    }
    setUsernameError('')

    // Assign a random color for this session and persist to sessionStorage
    const color = pickUserColor()
    sessionStorage.setItem('username', username.trim())
    sessionStorage.setItem('color', color)

    navigate(`/room/${roomId}`)
    return true
  }

  function handleCreateRoom() {
    const roomId = generateRoomId()
    enterRoom(roomId)
  }

  function handleJoinRoom(e) {
    e.preventDefault()
    const trimmed = joinRoomId.trim()
    if (!trimmed) {
      setJoinError('Please enter a room ID.')
      return
    }
    setJoinError('')
    enterRoom(trimmed)
  }

  return (
    <div className="landing">
      <div>
        <h1 className="landing__logo">CollabIDE</h1>
        <p className="landing__subtitle">Real-time collaborative code editor</p>
      </div>

      <div className="landing__card">
        {/* Username field — required before any room action */}
        <div>
          <label className="landing__label" htmlFor="username">
            Your display name
          </label>
          <input
            id="username"
            type="text"
            className={`landing__input${usernameError ? ' landing__input--error' : ''}`}
            placeholder="e.g. Alice"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              if (usernameError) setUsernameError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateRoom()
            }}
            maxLength={32}
            autoFocus
          />
          {usernameError && (
            <p className="landing__error" role="alert">
              {usernameError}
            </p>
          )}
        </div>

        {/* Create a new room */}
        <button className="btn btn--primary" onClick={handleCreateRoom}>
          Create new room
        </button>

        <div className="landing__divider">or join existing</div>

        {/* Join an existing room */}
        <form onSubmit={handleJoinRoom}>
          <label className="landing__label" htmlFor="roomId">
            Room ID
          </label>
          <input
            id="roomId"
            type="text"
            className={`landing__input${joinError ? ' landing__input--error' : ''}`}
            placeholder="Paste room ID here"
            value={joinRoomId}
            onChange={(e) => {
              setJoinRoomId(e.target.value)
              if (joinError) setJoinError('')
            }}
          />
          {joinError && (
            <p className="landing__error" role="alert">
              {joinError}
            </p>
          )}
          <button type="submit" className="btn btn--secondary" style={{ marginTop: '0.75rem' }}>
            Join room
          </button>
        </form>
      </div>
    </div>
  )
}
