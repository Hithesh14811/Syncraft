import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import EditorPage from './pages/EditorPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/room/:roomId" element={<EditorPage />} />
    </Routes>
  )
}
