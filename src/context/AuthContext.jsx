import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error('Error fetching profile:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function login(email, password) {
    setError(null)
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
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      setLoading(false)
      throw error
    }
  }

  async function createTechnician(name, email, password) {
    setError(null)
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
    setError(null)
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
    loading,
    error,
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
