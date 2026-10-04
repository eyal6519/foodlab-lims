import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          setUser(session.user)
          fetchProfile(session.user.id)
        } else {
          setUser(null)
          setProfile(null)
          setProfileError(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Distinguishes "the database refused the read" from "the row is absent".
  // Without this the app showed Access Pending for both, hiding a broken
  // profile policy behind a message that reads as a missing account.
  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data)
      setProfileError(null)
    } catch (err) {
      console.error('Error fetching profile:', err)
      setProfile(null)
      setProfileError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  async function login(email, password) {
    setProfileError(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) {
      setLoading(false)
      throw error
    }
    return data
  }

  async function logout() {
    setProfileError(null)
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      setLoading(false)
      throw error
    }
  }

  async function createTechnician(name, email, password) {
    // Calls the secure SQL RPC function defined in schema.sql
    const { data, error } = await supabase.rpc('admin_create_user', {
      user_email: email.trim().toLowerCase(),
      user_password: password,
      user_role: 'technician',
      user_name: name ? name.trim() : null
    })
    if (error) throw error
    return data;
  }

  async function updateAccount(email, password) {
    setLoading(true)
    const updates = {}
    if (email) updates.email = email.trim().toLowerCase()
    if (password) updates.password = password

    const { data, error } = await supabase.auth.updateUser(updates)
    if (error) {
      setLoading(false)
      throw error
    }
    setLoading(false)
    return data
  }

  const value = {
    user,
    profile,
    profileError,
    loading,
    login,
    logout,
    createTechnician,
    updateAccount,
    refreshProfile: () => user && fetchProfile(user.id)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
