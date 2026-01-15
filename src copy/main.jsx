import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider, ProtectedRoute } from './AuthProvider.jsx'
import AppContainer from './AppContainer.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ProtectedRoute>
        <AppContainer />
      </ProtectedRoute>
    </AuthProvider>
  </React.StrictMode>,
)
