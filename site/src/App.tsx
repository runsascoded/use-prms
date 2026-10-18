import { Route, Routes } from 'react-router-dom'
import { Home } from './components/Home'
import { HashDemo } from './components/HashDemo'
import { ParityReact } from './components/ParityReact'
import { FloatingControls } from './components/FloatingControls'

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/hash" element={<HashDemo />} />
        <Route path="/parity" element={<ParityReact />} />
      </Routes>
      <FloatingControls />
    </div>
  )
}
