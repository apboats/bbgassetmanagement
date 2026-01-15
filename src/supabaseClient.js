import { createClient } from '@supabase/supabase-js'

// ============================================================================
// SUPABASE CONFIGURATION
// ============================================================================
// 
// SETUP INSTRUCTIONS:
// 1. Go to your Supabase project dashboard
// 2. Click on "Settings" → "API"
// 3. Copy your Project URL and anon public key
// 4. Create a .env file in the root directory with:
//    VITE_SUPABASE_URL=your-project-url
//    VITE_SUPABASE_ANON_KEY=your-anon-key
// 5. For production deployment, set these as environment variables
//    in your hosting platform (Vercel, Netlify, GitHub Pages, etc.)
//
// IMPORTANT: Never commit .env file to Git!
// Add .env to .gitignore
// ============================================================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables!')
  console.log('Please create a .env file with:')
  console.log('VITE_SUPABASE_URL=your-project-url')
  console.log('VITE_SUPABASE_ANON_KEY=your-anon-key')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Helper function to check if user is authenticated
export const isAuthenticated = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return !!session
}

// Helper function to get current user
export const getCurrentUser = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  
  // Get user details from users table
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', session.user.id)
    .single()
  
  return user
}

// Helper function to sign out
export const signOut = async () => {
  await supabase.auth.signOut()
}
