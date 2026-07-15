/**
 * colors.js — User color palette for presence/cursor display
 *
 * Each user in a room is assigned a color from this palette when they join.
 * The color is stored in sessionStorage so it stays constant for the session.
 * Colors are chosen to be distinct and visible against the dark VS Code theme.
 */

export const USER_COLOR_PALETTE = [
  '#e91e63', // pink
  '#2196f3', // blue
  '#4caf50', // green
  '#ff9800', // orange
  '#9c27b0', // purple
  '#00bcd4', // cyan
  '#ff5722', // deep orange
  '#8bc34a', // light green
  '#f44336', // red
  '#3f51b5', // indigo
  '#009688', // teal
  '#ffc107', // amber
]

/**
 * Pick a random color from the user color palette.
 * @returns {string} A hex color string (e.g. "#e91e63")
 */
export function pickUserColor() {
  const idx = Math.floor(Math.random() * USER_COLOR_PALETTE.length)
  return USER_COLOR_PALETTE[idx]
}
