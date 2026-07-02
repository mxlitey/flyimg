import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import UploadPage from './pages/UploadPage'
import MyImagesPage from './pages/MyImagesPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<UploadPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/:userTag" element={<MyImagesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  )
}
