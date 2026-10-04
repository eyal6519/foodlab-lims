import { useState } from 'react'
import { XCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'

// Shared account-settings modal used by Manager and Technician views.
// `prefix` / `toastPrefix` / `alertPrefix` are the translation-namespace
// prefixes (e.g. 'mgr.settings' + 'mgr.toast' + 'mgr.alert').
// `onSaveName` + `initialName` enable the optional name-edit field (managers).
export default function AccountSettingsModal({ user, initialName, onSaveName, onClose, updateAccount, showToast, prefix, toastPrefix, alertPrefix }) {
  const { t } = useLanguage()
  const [name, setName] = useState(initialName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const trimmedName = (name || '').trim()
      const nameChanged = onSaveName && trimmedName !== (initialName || '').trim()
      if (nameChanged) await onSaveName(trimmedName)
      await updateAccount(email, password || null)
      showToast(t(`${toastPrefix}.account_updated`), 'success')
      onClose()
    } catch (err) {
      alert(`${t(`${alertPrefix}.account_update_error`)} ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border-0 sm:border border-slate-800 rounded-none sm:rounded-3xl w-full max-w-md h-full sm:h-auto p-6 shadow-2xl space-y-4 overflow-y-auto"
      >
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">{t(`${prefix}.title`)}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {onSaveName && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t(`${prefix}.name`)}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t(`${prefix}.email`)}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t(`${prefix}.password`)}</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all"
          >
            {t(`${prefix}.cancel`)}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-teal-500 hover:bg-teal-400 disabled:bg-teal-500/50 text-slate-950 text-xs font-bold rounded-xl transition-all"
          >
            {loading ? t(`${prefix}.saving`) : t(`${prefix}.save`)}
          </button>
        </div>
      </form>
    </div>
  )
}