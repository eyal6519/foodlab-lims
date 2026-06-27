import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { seedMockData, clearAllData, seedQAUsers } from '../../utils/mockDataGenerator'
import { Beaker, Users, Trash2, Database, ShieldAlert, LogOut, Check, Sparkles } from 'lucide-react'

export default function QADashboard() {
  const { login, logout, user, profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })

  const urlParams = new URLSearchParams(window.location.search)
  const forceQA = urlParams.get('qa') === 'true'
  const isDev = import.meta.env.DEV || 
                window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' ||
                forceQA

  // Do not render if not in local dev environment and not forced via ?qa=true
  if (!isDev) return null

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage({ text: '', type: '' }), 5000)
  }

  const handleSeed = async () => {
    setLoading(true)
    setMessage({ text: 'Seeding mock QA scenarios...', type: 'info' })
    try {
      const res = await seedMockData()
      if (res.success) {
        showMsg('Database successfully seeded with QA scenarios! Refreshing data...', 'success')
        // Trigger a reload or state refresh if we are already in the app
        setTimeout(() => window.location.reload(), 1000)
      } else {
        showMsg(`Failed to seed: ${res.error}`, 'error')
      }
    } catch (err) {
      showMsg(`Error: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    if (!window.confirm('Are you sure you want to delete all shipments, batches, test results, and templates?')) return
    setLoading(true)
    setMessage({ text: 'Wiping database...', type: 'info' })
    try {
      const res = await clearAllData()
      if (res.success) {
        showMsg('Database successfully wiped!', 'success')
        setTimeout(() => window.location.reload(), 1000)
      } else {
        showMsg(`Failed to wipe data: ${res.error}`, 'error')
      }
    } catch (err) {
      showMsg(`Error: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUsers = async () => {
    setLoading(true)
    setMessage({ text: 'Provisioning QA default users...', type: 'info' })
    try {
      const res = await seedQAUsers()
      if (res.success) {
        let details = res.results.map(r => `${r.user}: ${r.status}`).join(', ')
        showMsg(`QA Users provisioned successfully! (${details})`, 'success')
      } else {
        showMsg(`Failed to provision: ${res.error}`, 'error')
      }
    } catch (err) {
      showMsg(`Error: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickLogin = async (role) => {
    setLoading(true)
    const email = role === 'manager' ? 'manager@foodlab.com' : 'technician@foodlab.com'
    setMessage({ text: `Logging in as QA ${role}...`, type: 'info' })
    try {
      if (user) {
        await logout()
      }
      await login(email, 'password123')
      showMsg(`Logged in successfully as ${role}!`, 'success')
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      showMsg(`Could not login. Please click "Provision QA Accounts" first if they don't exist. Error: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 left-6 z-[9999] font-sans text-left">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:shadow-[0_0_25px_rgba(99,102,241,0.6)] active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <Beaker className="w-4 h-4 animate-bounce" />
          QA Panel
        </button>
      )}

      {/* Expanded Dashboard Panel */}
      {isOpen && (
        <div className="w-80 bg-slate-950/95 backdrop-blur-xl border border-indigo-500/30 rounded-3xl shadow-2xl p-5 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Beaker className="w-5 h-5" />
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                QA DEV Dashboard
              </h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          {/* Quick Info & Feedback message */}
          {message.text && (
            <div className={`p-2.5 rounded-xl text-xs mb-4 border leading-normal ${
              message.type === 'error' ? 'bg-red-950/80 border-red-500/20 text-red-250' :
              message.type === 'info' ? 'bg-indigo-950/80 border-indigo-500/20 text-indigo-250' :
              'bg-emerald-950/80 border-emerald-500/20 text-emerald-250'
            }`}>
              {message.text}
            </div>
          )}

          {/* User Status */}
          <div className="bg-slate-900/60 rounded-2xl p-3 border border-slate-800 text-xs mb-4">
            <div className="font-bold text-slate-400 mb-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> CURRENT USER
            </div>
            {user ? (
              <div className="flex justify-between items-center mt-1.5">
                <div>
                  <span className="text-white font-medium block truncate max-w-[150px]">{user.email}</span>
                  <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold">
                    Role: {profile?.role || 'Pending...'}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    await logout()
                    window.location.reload()
                  }}
                  className="p-1.5 bg-slate-800 hover:bg-red-950/40 hover:text-red-400 text-slate-400 rounded-lg transition-all cursor-pointer"
                  title="Logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-slate-500 italic">Not logged in</span>
            )}
          </div>

          {/* Section: Quick Auth Logins */}
          <div className="space-y-2 mb-4 font-semibold">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Quick Role Switches
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={loading}
                onClick={() => handleQuickLogin('manager')}
                className="flex items-center justify-center gap-1 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/20 hover:border-indigo-500/40 rounded-xl text-indigo-200 text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
              >
                <span>Manager</span>
              </button>
              <button
                disabled={loading}
                onClick={() => handleQuickLogin('technician')}
                className="flex items-center justify-center gap-1 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/20 hover:border-purple-500/40 rounded-xl text-purple-200 text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
              >
                <span>Technician</span>
              </button>
            </div>
            <button
              disabled={loading}
              onClick={handleCreateUsers}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[10px] uppercase tracking-wider font-bold rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Provision QA Accounts
            </button>
          </div>

          {/* Section: Data Control */}
          <div className="space-y-2 pt-2 border-t border-slate-900">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Data Seeding
            </div>
            <button
              disabled={loading}
              onClick={handleSeed}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl active:scale-[0.98] transition-all duration-200 shadow-md shadow-indigo-600/10 disabled:opacity-50 cursor-pointer"
            >
              <Database className="w-4 h-4" />
              Seed QA Scenarios
            </button>
            
            <button
              disabled={loading}
              onClick={handleClear}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-800/40 text-red-300 hover:text-red-200 text-xs font-bold rounded-xl active:scale-[0.98] transition-all duration-200 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              Wipe All Data
            </button>
          </div>

          {/* Footer Credentials Info */}
          <div className="mt-4 pt-3 border-t border-slate-900 text-[10px] text-slate-400 leading-relaxed space-y-1">
            <p className="font-bold flex items-center gap-1 text-slate-400">
              <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" /> QA Credentials Info:
            </p>
            <p>Email: <code className="text-slate-350 bg-slate-900 px-1 rounded">manager@foodlab.com</code></p>
            <p>Email: <code className="text-slate-350 bg-slate-900 px-1 rounded">technician@foodlab.com</code></p>
            <p>Password: <code className="text-slate-350 bg-slate-900 px-1 rounded">password123</code></p>
            <p className="text-[9px] text-slate-500 italic mt-2">
              Note: Wiping or Seeding requires logging in as a Manager.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
