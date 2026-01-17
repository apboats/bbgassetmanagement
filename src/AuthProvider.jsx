// ============================================================================
// AUTHENTICATION PROVIDER
// ============================================================================
// Wraps the entire app and provides authentication context
// Handles login, logout, session management, and user state
// ============================================================================

import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { authService } from './services/supabaseService'

// Create context
const AuthContext = createContext({})

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

// Auth Provider Component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [showPasswordReset, setShowPasswordReset] = useState(false)

  // Use a ref to track profile loading to avoid closure issues
  const profileLoadingRef = React.useRef(false)
  const initializedRef = React.useRef(false)

  // Check for existing session on mount
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (initializedRef.current) return
    initializedRef.current = true
    
    let isMounted = true
    
    const initAuth = async () => {
      try {
        console.log('Checking for existing user session...')
        const session = await authService.getSession()
        
        if (!isMounted) return
        
        console.log('Session found:', session ? 'Yes' : 'No')
        setSession(session)
        
        if (session?.user) {
          console.log('Loading user profile from session...')
          await loadUserProfile(session.user.id)
        }
      } catch (error) {
        console.error('Error checking user:', error)
      } finally {
        if (isMounted) {
          console.log('✓ Check user complete, setting loading to false')
          setLoading(false)
        }
      }
    }
    
    initAuth()

    // Listen for auth changes AFTER initial load
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return
        
        console.log('Auth event:', event, 'Session:', session ? 'exists' : 'null')
        
        // Skip initial events - we handle those in initAuth
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          // Only handle SIGNED_IN if it's a fresh login (not page load)
          // We can tell by checking if we already have a user
          if (user) {
            console.log('Already have user, skipping duplicate load')
            return
          }
          // If loading is still true, initAuth will handle it
          if (loading) {
            console.log('Initial auth in progress, skipping')
            return
          }
        }
        
        // Handle different auth events
        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED':
            setSession(session)
            if (session?.user && !profileLoadingRef.current) {
              console.log('Auth state changed, loading user profile...')
              await loadUserProfile(session.user.id)
            }
            break
            
          case 'SIGNED_OUT':
            console.log('User signed out, clearing state')
            setSession(null)
            setUser(null)
            break
            
          case 'PASSWORD_RECOVERY':
            // User clicked reset link in email - show password reset form
            console.log('Password recovery mode activated')
            setSession(session)
            setShowPasswordReset(true)
            break
            
          default:
            // For unknown events, only update if we have a session
            if (session) {
              setSession(session)
            }
            break
        }
      }
    )

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  // Load user profile from database
  const loadUserProfile = async (authId, retryCount = 0) => {
    if (profileLoadingRef.current) {
      console.log('Profile already loading, skipping duplicate request')
      return null
    }
    
    console.log('Loading user profile for auth_id:', authId)
    profileLoadingRef.current = true
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authId)
        .single()

      if (error) {
        console.error('Error loading user profile:', error)
        throw error
      }
      
      console.log('✓ User profile loaded:', data)
      setUser(data)
      return data
    } catch (error) {
      console.error('Failed to load user profile:', error)
      
      // Retry up to 2 times for network errors
      if (retryCount < 2 && (error.code === 'PGRST000' || error.message?.includes('fetch'))) {
        console.log(`Retrying user profile load (attempt ${retryCount + 2}/3)...`)
        profileLoadingRef.current = false
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
        return loadUserProfile(authId, retryCount + 1)
      }
      
      // Profile doesn't exist - database trigger should have created it
      if (error.code === 'PGRST116') {
        console.error('User profile not found. Please contact an administrator.')
      }
      
      // Set user to null so they see login screen
      setUser(null)
      return null
    } finally {
      profileLoadingRef.current = false
    }
  }

  // Sign up new user
  const signUp = async (email, password, userData) => {
    try {
      setLoading(true)
      const result = await authService.signUp(email, password, userData)
      return { data: result, error: null }
    } catch (error) {
      console.error('Sign up error:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }

  // Sign in existing user
  const signIn = async (email, password) => {
    try {
      setLoading(true)
      const result = await authService.signIn(email, password)
      
      // Load user profile
      if (result.session?.user) {
        await loadUserProfile(result.session.user.id)
      }
      
      return { data: result, error: null }
    } catch (error) {
      console.error('Sign in error:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      setLoading(true)
      await authService.signOut()
      setUser(null)
      setSession(null)
      return { error: null }
    } catch (error) {
      console.error('Sign out error:', error)
      return { error }
    } finally {
      setLoading(false)
    }
  }

  // Refresh user profile (useful after role changes)
  const refreshUser = async () => {
    if (session?.user) {
      await loadUserProfile(session.user.id)
    }
  }

  // Check if user has specific role
  const hasRole = (role) => {
    return user?.role === role
  }

  // Check if user is admin
  const isAdmin = () => {
    return user?.role === 'admin'
  }

  // Check if user is manager or admin
  const isManagerOrAdmin = () => {
    return user?.role === 'admin' || user?.role === 'manager'
  }

  // Request password reset
  const requestPasswordReset = async (email) => {
    try {
      setLoading(true)
      await authService.resetPasswordRequest(email)
      return { error: null }
    } catch (error) {
      console.error('Password reset request error:', error)
      return { error }
    } finally {
      setLoading(false)
    }
  }

  // Update password
  const updatePassword = async (newPassword) => {
    try {
      setLoading(true)
      await authService.updatePassword(newPassword)
      return { error: null }
    } catch (error) {
      console.error('Password update error:', error)
      return { error }
    } finally {
      setLoading(false)
    }
  }

  // Context value
  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    refreshUser,
    hasRole,
    isAdmin,
    isManagerOrAdmin,
    requestPasswordReset,
    updatePassword,
    showPasswordReset,
    setShowPasswordReset,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ============================================================================
// LOGIN COMPONENT
// ============================================================================
// Simple login/signup form
// ============================================================================

export const LoginForm = () => {
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { signIn, signUp, requestPasswordReset } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (isForgotPassword) {
        // Forgot password
        const { error: resetError } = await requestPasswordReset(email)

        if (resetError) throw resetError

        setMessage('Password reset email sent! Please check your inbox.')
        setIsForgotPassword(false)
        setEmail('')
      } else if (isSignUp) {
        // Sign up
        if (!username || !name) {
          setError('Please fill in all fields')
          return
        }

        const { data, error: signUpError } = await signUp(email, password, {
          username,
          name,
        })

        if (signUpError) throw signUpError

        setMessage('Account created! Please check your email to confirm.')
        setIsSignUp(false)
      } else {
        // Sign in
        const { data, error: signInError } = await signIn(email, password)

        if (signInError) throw signInError
        
        // Success - AuthProvider will handle redirect
      }
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Boats by George
          </h1>
          <p className="text-slate-600">Asset Management System</p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  required={isSignUp}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="johndoe"
                  required={isSignUp}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              required
            />
          </div>

          {!isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                required
                minLength={6}
              />
              {isSignUp && (
                <p className="text-xs text-slate-500 mt-1">
                  Minimum 6 characters
                </p>
              )}
            </div>
          )}

          {!isSignUp && !isForgotPassword && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true)
                  setError('')
                  setMessage('')
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isForgotPassword ? 'Sending Reset Link...' : isSignUp ? 'Creating Account...' : 'Signing In...'}
              </span>
            ) : (
              <span>{isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In'}</span>
            )}
          </button>
        </form>

        {/* Toggle Sign Up/Sign In/Forgot Password */}
        <div className="mt-6 text-center space-y-2">
          {isForgotPassword ? (
            <button
              onClick={() => {
                setIsForgotPassword(false)
                setError('')
                setMessage('')
              }}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Back to Sign In
            </button>
          ) : (
            <button
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError('')
                setMessage('')
              }}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PASSWORD RESET MODAL
// ============================================================================
// Shown when user clicks password reset link in email
// ============================================================================

export const PasswordResetModal = () => {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { setShowPasswordReset } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Validate password length
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      console.log('Attempting to update password...')
      
      // Call Supabase directly instead of going through authService
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      console.log('Update response:', { data, error: updateError })

      if (updateError) {
        console.error('Update error:', updateError)
        throw updateError
      }

      console.log('Password updated successfully!')
      setMessage('Password updated successfully! Redirecting...')
      
      // Close modal and refresh page after 2 seconds
      setTimeout(() => {
        setShowPasswordReset(false)
        window.location.href = '/'
      }, 2000)
    } catch (err) {
      console.error('Caught error:', err)
      setError(err.message || 'Failed to update password. Please try again.')
      setLoading(false)
    }
  }

  // Add a cancel/close button in case user gets stuck
  const handleCancel = () => {
    setShowPasswordReset(false)
    window.location.href = '/'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
          disabled={loading}
        >
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Reset Your Password</h2>
          <p className="text-slate-600 mt-2">Enter your new password below</p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            <p className="font-medium">Error</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={handleCancel}
              className="text-sm underline mt-2"
            >
              Back to login
            </button>
          </div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter new password"
              required
              minLength={6}
              disabled={loading || message}
            />
            <p className="text-xs text-slate-500 mt-1">
              Minimum 6 characters
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Confirm new password"
              required
              minLength={6}
              disabled={loading || message}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || message}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Updating...
                </span>
              ) : message ? (
                'Redirecting...'
              ) : (
                'Update Password'
              )}
            </button>
          </div>
        </form>

        {/* Debug info in development */}
        {loading && (
          <div className="mt-4 text-xs text-slate-500 text-center">
            <p>If this takes more than 10 seconds, check your internet connection</p>
            <p>or click Cancel to try again</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// PROTECTED ROUTE WRAPPER
// ============================================================================
// Wraps components that require authentication
// ============================================================================

export const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { user, loading, isAdmin, showPasswordReset } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show password reset modal if needed
  if (showPasswordReset) {
    return <PasswordResetModal />
  }

  if (!user) {
    return <LoginForm />
  }

  if (requireAdmin && !isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h3>
          <p className="text-slate-600">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    )
  }

  return children
}

export default AuthProvider
