import React, { useState, useEffect, useRef } from 'react'
import { Menu, X, Bell, Settings, LogOut, Beaker } from 'lucide-react'
import LanguageToggle from './LanguageToggle'
import ThemeToggle from './ThemeToggle'
import { useLanguage } from '../context/LanguageContext'

export default function ResponsiveShell({
  role,
  profileName,
  activeTab,
  onTabChange,
  tabs = [],
  dueBatches = [],
  onNotificationItemClick,
  logout,
  setSettingsModalOpen,
  storageWarning = null,
  children
}) {
  const { language, t } = useLanguage()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef(null)

  // Determine language direction (reactive to state)
  const isRtl = language === 'he'

  // Close notifications popover on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeTabObj = tabs.find(tab => tab.id === activeTab)
  const activeTitle = activeTabObj ? activeTabObj.label : ''

  const handleTabClick = (tabId) => {
    onTabChange(tabId)
    setDrawerOpen(false)
  }

  // Shared Sidebar & Drawer Links Component
  const renderNavigationLinks = () => (
    <div className="space-y-1.5 py-4">
      {tabs.map(tab => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 select-none ${
              isRtl ? 'flex-row text-right' : 'flex-row text-left'
            } ${
              isActive
                ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-slate-950 shadow-lg shadow-teal-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className={`whitespace-normal flex-1 ${isRtl ? 'text-right' : 'text-left'}`}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )

  // Shared Notification Bell Component
  const renderNotificationBell = () => (
    <div className="relative" ref={bellRef}>
      <button
        onClick={() => setBellOpen(!bellOpen)}
        className={`p-2.5 bg-slate-800 hover:bg-teal-950/40 border ${
          dueBatches.length > 0 || storageWarning
            ? 'border-amber-500 text-amber-400 bg-amber-950/10'
            : 'border-slate-700 text-slate-300 hover:text-teal-400'
        } rounded-xl transition-all duration-200 relative`}
        title={t('mgr.header.incubation_alerts')}
      >
        <Bell className="w-5 h-5" />
        {(dueBatches.length > 0 || storageWarning) && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-extrabold w-4.5 h-4.5 rounded-full flex items-center justify-center border border-slate-900 animate-pulse">
            {dueBatches.length + (storageWarning ? 1 : 0)}
          </span>
        )}
      </button>

      {bellOpen && (
        <div className={`absolute bottom-full mb-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl z-50 p-3 space-y-2 text-xs text-slate-200 ${
          isRtl ? 'right-0' : 'left-0'
        }`}>
          <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
            <span className="font-bold text-white">{t('tech.header.incubation_alerts')}</span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
              {t('mgr.bell.due_badge').replace('{n}', dueBatches.length)}
            </span>
          </div>
          {dueBatches.length === 0 && !storageWarning ? (
            <p className="text-slate-500 italic text-center py-4">{t('mgr.bell.empty')}</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {storageWarning && (
                <div className={`p-2 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-2.5 ${
                  isRtl ? 'flex-row-reverse text-right' : 'text-left'
                }`}>
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-amber-300 text-[10px] uppercase tracking-wider">💾 {t('mgr.storage.title')}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{storageWarning}</p>
                  </div>
                </div>
              )}
              {dueBatches.map(b => (
                <div
                  key={b.id}
                  onClick={() => {
                    onNotificationItemClick(b)
                    setBellOpen(false)
                    setDrawerOpen(false)
                  }}
                  className={`p-2 hover:bg-slate-800/60 rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-750 flex items-start gap-2.5 ${
                    isRtl ? 'flex-row-reverse text-right' : 'text-left'
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0 animate-ping" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-100 truncate">{b.template_name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {t('mgr.archive.batch_label').replace('{n}', b.number || t('common.unnamed_batch'))} • {t('mgr.archive.supplier')} <span>{b.supplier}</span>
                    </p>
                    <p className="text-[9px] text-amber-400 font-bold uppercase mt-1">
                      {t('mgr.bell.ready_badge')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Shared Bottom Profile & Actions
  const renderBottomActions = () => (
    <div className="border-t border-slate-800 pt-4 mt-auto space-y-4">
      <div className={`flex items-center justify-between gap-3 px-1 ${
        isRtl ? 'flex-row-reverse' : ''
      }`}>
        <div className={`min-w-0 flex-1 ${isRtl ? 'text-right' : 'text-left'}`}>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('mgr.header.signed_in')}</p>
          <p className="text-xs font-semibold text-slate-350 truncate">{profileName}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
      <div className="flex gap-2">
        {renderNotificationBell()}
        <button
          onClick={() => {
            setSettingsModalOpen(true)
            setDrawerOpen(false)
          }}
          className="flex-1 flex items-center justify-center p-2.5 bg-slate-800 hover:bg-teal-950/40 border border-slate-700 hover:border-teal-500/30 text-slate-300 hover:text-teal-400 rounded-xl transition-all duration-200"
          title={t('mgr.header.settings')}
        >
          <Settings className="w-5 h-5" />
        </button>
        <button
          onClick={() => {
            logout()
            setDrawerOpen(false)
          }}
          className="p-2.5 bg-slate-800 hover:bg-red-950/40 border border-slate-700 hover:border-red-500/30 text-slate-300 hover:text-red-400 rounded-xl transition-all duration-200"
          title={t('mgr.header.logout')}
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  )

  return (
    <div className={`min-h-screen bg-slate-950 text-white flex flex-col overflow-x-hidden w-full max-w-full ${
      isRtl ? 'lg:flex-row-reverse' : 'lg:flex-row'
    }`}>
      {/* 1. DESKTOP LEFT SIDEBAR */}
      <aside className={`hidden lg:flex fixed top-0 bottom-0 ${
        isRtl ? 'right-0 border-l' : 'left-0 border-r'
      } w-64 bg-slate-900 border-slate-800 flex-col p-6 z-30 justify-between`}>
        <div className="space-y-6">
          {/* Brand/Logo */}
          <div className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <div className="p-2.5 bg-teal-500/10 border border-teal-500/20 rounded-2xl text-teal-400">
              <Beaker className="w-6 h-6" />
            </div>
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <h2 className="text-sm font-black tracking-widest text-white uppercase">FoodLab LIMS</h2>
              <span className="text-[9px] font-bold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider block mt-0.5 w-fit">
                {role === 'manager' ? t('mgr.header.badge') : 'Technician'}
              </span>
            </div>
          </div>
          {/* Nav Links */}
          {renderNavigationLinks()}
        </div>

        {/* Profile, Settings, Notifications, Lang, Logout */}
        {renderBottomActions()}
      </aside>

      {/* 2. MOBILE TOP STICKY HEADER */}
      <header className="lg:hidden sticky top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-40 no-print">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 text-slate-300 hover:text-white rounded-xl bg-slate-800/40 border border-slate-800"
          aria-label="Open Navigation Drawer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-white truncate px-2">{activeTitle}</span>
        <span className="text-[10px] font-extrabold text-teal-400 border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
          {role === 'manager' ? 'Manager' : 'Technician'}
        </span>
      </header>

      {/* 3. MOBILE DRAWER OVERLAY & PANEL */}
      <div className={`lg:hidden fixed inset-0 z-50 flex transition-opacity duration-300 ${
        drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}>
        {/* Backdrop overlay */}
        <div
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Slide-out drawer panel */}
        <div className={`fixed top-0 bottom-0 w-72 bg-slate-900 border-slate-850 p-6 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-out z-50 ${
          isRtl 
            ? `right-0 border-l ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}` 
            : `left-0 border-r ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`
        }`}>
          <div className="space-y-6">
            {/* Drawer Header */}
            <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-xl text-teal-400">
                  <Beaker className="w-5 h-5" />
                </div>
                <span className="text-sm font-black tracking-widest text-white uppercase">LIMS</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav Links */}
            {renderNavigationLinks()}
          </div>

          {/* Bottom Actions */}
          {renderBottomActions()}
        </div>
      </div>

      {/* 4. MAIN PANEL CONTENT */}
      <main className={`flex-1 min-w-0 ${isRtl ? 'lg:mr-64' : 'lg:pl-64'} flex flex-col`}>
        {children}
      </main>
    </div>
  )
}
