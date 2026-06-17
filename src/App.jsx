import React from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import ManagerView from './components/ManagerView'
import TechnicianView from './components/TechnicianView'
import { Beaker } from 'lucide-react'

function AppContent() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center gap-4">
        <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-2xl text-teal-400">
          <Beaker className="w-8 h-8 animate-spin" />
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
          Loading LIMS Portal...
        </p>
      </div>
    )
  }

  // Not logged in -> Show login form
  if (!user) {
    return <Login />
  }

  // Logged in -> Route based on profile role
  if (profile?.role === 'manager') {
    return <ManagerView />
  }

  if (profile?.role === 'technician') {
    return <TechnicianView />
  }

  // User logged in but lacks profile role (e.g. pending setup)
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-center">
      <div className="max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-4 shadow-xl">
        <h2 className="text-xl font-bold text-white">Access Pending</h2>
        <p className="text-sm text-slate-450">
          Your account ({user.email}) has been authenticated successfully, but a Lab Manager has not yet assigned you a role.
        </p>
        <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider">
          Please contact your Laboratory Administrator.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
