import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, ProtectedRoute } from './AuthProvider.jsx'
import AppContainer from './AppContainer.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoute>
          <AppContainer />
        </ProtectedRoute>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
