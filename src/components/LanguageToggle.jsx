import React from 'react'
import { useLanguage } from '../context/LanguageContext'

export default function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage()
  const isHebrew = language === 'he'

  return (
    <button
      onClick={toggleLanguage}
      title={isHebrew ? 'Switch to English' : 'עבור לעברית'}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-all duration-200 text-[11px] font-bold tracking-wide select-none"
    >
      <span className="text-sm leading-none">{isHebrew ? '🇮🇱' : '🇺🇸'}</span>
      <span>{isHebrew ? 'EN' : 'עב'}</span>
    </button>
  )
}
