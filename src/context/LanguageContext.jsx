import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import he from '../locales/he'
import en from '../locales/en'

const locales = { he, en }

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('lims_language') || 'he'
  })

  // Apply RTL/LTR direction to the document root whenever language changes
  useEffect(() => {
    const dir = language === 'he' ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', language)
    localStorage.setItem('lims_language', language)
  }, [language])

  /**
   * Translation function.
   * Usage: t('key') or t('key', { n: 5, name: 'Eyal' })
   * Supports simple {placeholder} interpolation.
   */
  const t = useCallback((key, vars = {}) => {
    const locale = locales[language] || locales['he']
    let str = locale[key] ?? locales['en'][key] ?? key

    // Replace {placeholder} tokens with values from vars
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    })

    return str
  }, [language])

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => prev === 'he' ? 'en' : 'he')
  }, [])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>')
  return ctx
}
