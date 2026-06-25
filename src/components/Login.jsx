import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { Beaker, Lock, Mail, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import LanguageToggle from './LanguageToggle'

export default function Login() {
  const { login } = useAuth()
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState({ visible: false, message: '', title: '', type: 'error' })

  useEffect(() => {
    // Proactively check if LIMS is configured
    const hasConfig = import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')
    if (!hasConfig) {
      setToast({
        visible: true,
        type: 'warning',
        title: t('login.toast.offline.title'),
        message: t('login.toast.offline.body')
      })
    }
  }, [t])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setToast(prev => ({ ...prev, visible: false }))
    setLoading(true)

    const hasConfig = import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')
    if (!hasConfig) {
      setToast({
        visible: true,
        type: 'warning',
        title: t('login.toast.config_missing.title'),
        message: t('login.toast.config_missing.body')
      })
      setLoading(false)
      return
    }

    try {
      await login(email, password)
    } catch (err) {
      const errMsg = err.message || ''
      const errStatus = err.status || 0
      
      let title = t('login.toast.auth_failed.title')
      let message = t('login.toast.auth_failed.body')
      let type = 'error'

      if (errMsg.includes('Invalid login credentials') || errMsg.includes('invalid_grant')) {
        title = t('login.toast.bad_credentials.title')
        message = t('login.toast.bad_credentials.body')
      } else if (errStatus === 500 || errMsg.includes('unexpected_failure') || errMsg.includes('database')) {
        title = t('login.toast.server_error.title')
        message = t('login.toast.server_error.body')
      } else if (errMsg.includes('fetch') || errMsg.includes('network') || errMsg.includes('NetworkError')) {
        title = t('login.toast.network.title')
        message = t('login.toast.network.body')
      } else {
        title = t('login.toast.generic.title')
        message = errMsg || t('login.toast.generic.body')
      }

      setToast({
        visible: true,
        title,
        message,
        type
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Language Toggle — top right */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle />
      </div>

      {/* Toast Notification Container */}
      {toast.visible && (
        <div className="fixed top-6 right-6 left-6 sm:left-auto z-50 max-w-sm animate-in slide-in-from-top-4 duration-300">
          <div className={`p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex gap-3 items-start ${
            toast.type === 'error' 
              ? 'bg-red-950/90 border-red-500/30 text-red-200' 
              : toast.type === 'warning'
              ? 'bg-amber-950/90 border-amber-500/30 text-amber-200'
              : 'bg-teal-950/90 border-teal-500/30 text-teal-200'
          }`}>
            {toast.type === 'error' && <AlertCircle className="w-5.5 h-5.5 text-red-400 shrink-0 mt-0.5" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5.5 h-5.5 text-amber-400 shrink-0 mt-0.5" />}
            {toast.type === 'info' && <Info className="w-5.5 h-5.5 text-teal-400 shrink-0 mt-0.5" />}
            
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider mb-1">
                {toast.title}
              </h4>
              <p className="text-xs opacity-90 leading-relaxed break-words">
                {toast.message}
              </p>
            </div>
            
            <button 
              type="button"
              onClick={() => setToast(prev => ({ ...prev, visible: false }))}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {/* Background ambient light effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-teal-500/10 border border-teal-500/20 rounded-2xl mb-4 text-teal-400">
            <Beaker className="w-10 h-10 animate-pulse" />
          </div>
          <p className="text-xs uppercase tracking-widest text-teal-400 font-semibold mb-1">
            {t('login.subtitle')}
          </p>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {t('login.title')}
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            {t('login.heading')}
          </p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                {t('login.email_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.email_placeholder')}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all duration-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                {t('login.password_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.password_placeholder')}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all duration-200"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-semibold rounded-2xl shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('login.submitting')}
                </span>
              ) : (
                t('login.submit')
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-8">
          {t('login.footer')}
        </p>
      </div>
    </div>
  )
}
