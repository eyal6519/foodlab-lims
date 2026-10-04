import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import { calculateTest, isTestEntered, isShipmentArchived, isTestLocked, getTestDefinition } from '../utils/calculations'
import { buildBatchRowsFromForm, persistShipmentBatches } from '../utils/shipmentPersistence'
import BatchTestingPage from './BatchTestingPage'
import ShipmentModal from './ShipmentModal'
import ResponsiveShell from './ResponsiveShell'
import {
  Clock,
  Lock,
  Unlock,
  ClipboardList,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  Settings,
  Plus,
  Edit,
  Search,
  X,
  Archive,
  Printer,
  Download,
  FileText,
  Calendar
} from 'lucide-react'
import { downloadCoaPdf as downloadCoaPdfShared } from '../utils/coaPdf'
import { getIncubationStatus as getIncubationStatusShared, formatExitText as formatExitTextShared } from '../utils/incubationStatus'
import COAReportView from './COAReportView'
import AccountSettingsModal from './AccountSettingsModal'

export default function TechnicianView() {
  const { user, profile, logout, updateAccount } = useAuth()
  const { t } = useLanguage()
  const [shipments, setShipments] = useState([])
  const [templates, setTemplates] = useState([])
  const [results, setResults] = useState({}) // batchId:testId -> replicates list
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'due' | 'intake' | 'templates'
  const [usersList, setUsersList] = useState([])
  const [myMissionsOnly, setMyMissionsOnly] = useState(true)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all') // 'all' | 'incubation' | 'bypass'

  // Archive & COA Reprint States
  const [coaSelectedBatchId, setCoaSelectedBatchId] = useState('')
  const [coaSearch, setCoaSearch] = useState('')
  const [coaFilterDateType, setCoaFilterDateType] = useState('all') // 'all' | 'approved_at' | 'intake_date' | 'production_date'
  const [coaStartDate, setCoaStartDate] = useState('')
  const [coaEndDate, setCoaEndDate] = useState('')

  // Modal State
  const [activeBatchTesting, setActiveBatchTesting] = useState(null) // { batch, shipment }
  const [shipmentModal, setShipmentModal] = useState(null) // { id, template_id, ... } or 'new'
  const [expandedShipmentId, setExpandedShipmentId] = useState(null)
  const [expandedBatchId, setExpandedBatchId] = useState(null)
  const [expandedIntakeShipmentId, setExpandedIntakeShipmentId] = useState(null)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type })
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }))
    }, 3000)
  }

  const [notifiedBatchIds, setNotifiedBatchIds] = useState([])

  // Request notification permissions on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }
  }, [])

  // Populate initial notified IDs so we don't notify for batches already due on load
  useEffect(() => {
    if (shipments.length > 0) {
      const initialDueIds = shipments
        .flatMap(s => (s.batches || []).map(b => ({ ...b, template_id: s.template_id })))
        .filter(b => getIncubationStatus(b, b.template_id).due)
        .map(b => b.id)
      setNotifiedBatchIds(initialDueIds)
    }
  }, [shipments.length])

  // Background interval checking for new incubation exits
  useEffect(() => {
    const checkExits = () => {
      const activeDue = shipments
        .flatMap(s => (s.batches || []).map(b => ({ ...b, template_id: s.template_id, supplier: s.supplier, template_name: getTemplate(s.template_id)?.name })))
        .filter(b => {
          const bStatus = getIncubationStatus(b, b.template_id)
          return bStatus.due
        })

      activeDue.forEach(b => {
        if (!notifiedBatchIds.includes(b.id)) {
          // Trigger browser notification
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(t('tech.notif.title'), {
              body: t('tech.notif.body').replace('{product}', b.template_name || t('common.product')).replace('{n}', b.number || t('common.unnamed_batch')),
              tag: b.id
            })
          }
          // Trigger in-app toast
          showToast(t('tech.toast.incubation_ready').replace('{product}', b.template_name || t('common.product')).replace('{n}', b.number || t('common.unnamed_batch')), 'info')
          
          // Add to notified list
          setNotifiedBatchIds(prev => [...prev, b.id])
        }
      })
    }

    const interval = setInterval(checkExits, 15000) // check every 15 seconds
    return () => clearInterval(interval)
  }, [shipments, notifiedBatchIds])

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      // 1. Fetch templates
      const { data: templatesData } = await supabase
        .from('product_templates')
        .select('*')
      setTemplates(templatesData || [])

      // 2. Fetch shipments and batches
      const { data: shipmentsData } = await supabase
        .from('shipments')
        .select(`
          *,
          batches(*)
        `)
        .order('created_at', { ascending: false })
      setShipments(shipmentsData || [])

      // 3. Fetch test results
      const { data: resultsData } = await supabase
        .from('test_results')
        .select('*')
      
      const resultsMap = {}
      if (resultsData) {
        resultsData.forEach(r => {
          resultsMap[`${r.batch_id}:${r.test_id}`] = r.replicates
        })
      }
      setResults(resultsMap)

      // 4. Fetch profiles (users)
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
      setUsersList(profilesData || [])
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAllResults = async (upsertPayload, isSubmit = false) => {
    if (!activeBatchTesting) return
    const { batch } = activeBatchTesting

    try {
      const payloadWithTime = upsertPayload.map(item => ({
        ...item,
        updated_at: new Date().toISOString()
      }))

      // Insert or Update in Supabase
      const { error } = await supabase
        .from('test_results')
        .upsert(payloadWithTime, { onConflict: 'batch_id,test_id' })

      if (error) throw error

      const batchUpdates = {}
      if (isSubmit) {
        batchUpdates.submitted_at = new Date().toISOString()
      }
      if (batch.retest_requested_at) {
        batchUpdates.retest_requested_at = null
        batchUpdates.retest_reason = null
      }

      // Update batches table if there are field updates
      if (Object.keys(batchUpdates).length > 0) {
        const { error: batchError } = await supabase
          .from('batches')
          .update(batchUpdates)
          .eq('id', batch.id)
        if (batchError) throw batchError

        // Update local shipments state
        setShipments(prev => prev.map(s => {
          if (s.id === batch.shipment_id) {
            return {
              ...s,
              batches: s.batches.map(b => b.id === batch.id ? { ...b, ...batchUpdates } : b)
            }
          }
          return s
        }))
      }

      // Update local state
      setResults(prev => {
        const newResults = { ...prev }
        upsertPayload.forEach(item => {
          newResults[`${item.batch_id}:${item.test_id}`] = item.replicates
        })
        return newResults
      })

      setActiveBatchTesting(null)
      if (isSubmit) {
        showToast(t('batch.alert.submit_success'))
      } else {
        showToast(t('tech.toast.results_saved'))
      }
    } catch (err) {
      alert(`${t('tech.alert.results_save_error')} ${err.message}`)
    }
  }

  // Shipment Actions
  const handleSaveShipment = async (e) => {
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form))
    const isNew = shipmentModal === 'new'
    
    const template = templates.find(t => t.id === data.template_id)
    const intakeDate = data.intake_date

    try {
      let shipmentId = isNew ? null : shipmentModal.id

      // 1. Save shipment details (set shipment level incubation fields to 0 / null)
      const payload = {
        template_id: data.template_id,
        supplier: data.supplier,
        intake_date: intakeDate,
        size: data.size || null,
        units_36: 0,
        units_55: 0,
        exit_36: null,
        exit_55: null,
        is_manually_unlocked: false
      }

      if (isNew) {
        const { data: createdShipment, error } = await supabase
          .from('shipments')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        shipmentId = createdShipment.id
      } else {
        const { error } = await supabase
          .from('shipments')
          .update(payload)
          .eq('id', shipmentId)
        if (error) throw error
      }

      // 2. Save batches
      const batchRows = buildBatchRowsFromForm(form, {
        isNew,
        shipmentId,
        template,
        intakeDate,
        existingBatches: shipmentModal.batches
      })

      await persistShipmentBatches(supabase, shipmentId, isNew, batchRows)

      setShipmentModal(null)
      fetchData()
      showToast(isNew ? t('tech.toast.shipment_logged') : t('tech.toast.shipment_updated'))
    } catch (err) {
      alert(`${t('tech.alert.shipment_save_error')} ${err.message}`)
    }
  }

  // Toggle incubation manually (Override Lock)
  const toggleIncubationUnlock = async (batchId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('batches')
        .update({ is_manually_unlocked: !currentStatus })
        .eq('id', batchId)
      if (error) throw error
      fetchData()
    } catch (err) {
      alert(`${t('tech.alert.override_error')} ${err.message}`)
    }
  }

  // Generate PDF client-side
  const downloadCoaPdf = (batchNumber) => {
    downloadCoaPdfShared(batchNumber, {
      coa_missing: t('tech.alert.coa_missing'),
      pdf_library: t('tech.alert.pdf_library'),
      pdf_save_error: t('tech.alert.pdf_save_error'),
      pdf_execution_error: t('tech.alert.pdf_execution_error'),
      pdf_load_failed: t('tech.alert.pdf_load_failed'),
      pdf_local_unresolved: t('tech.alert.pdf_local_unresolved')
    })
  }

  // Helpers
  const getTemplate = (id) => templates.find(t => t.id === id)

  const getIncubationStatus = (batch, templateId) => getIncubationStatusShared(batch, getTemplate(templateId), t)

  const formatExitText = (exitDateStr) => formatExitTextShared(exitDateStr, t)

  // Filter shipments
  const filteredShipments = shipments.filter(shipment => {
    if (isShipmentArchived(shipment)) return false // Hide archived shipments from technician active view

    // If 'My Missions Only' toggle is enabled, filter out shipments not assigned to current user
    if (myMissionsOnly && activeTab === 'pending') {
      const assignedIds = Array.isArray(shipment.assigned_to) ? shipment.assigned_to : []
      if (!assignedIds.includes(user.id)) {
        return false
      }
    }

    if (activeTab === 'pending') {
      const temp = getTemplate(shipment.template_id)
      return (shipment.batches || []).some(b => {
        if (b.approved_at) return false
        if (getIncubationStatus(b, shipment.template_id).locked) return false
        
        const pendingTests = (temp?.tests || []).filter(testId => {
          const test = getTestDefinition(testId, temp)
          if (!test || test.isCalculated) return false
          if (isTestLocked(testId, b, temp)) return false
          return !isTestEntered(testId, b.id, results, temp)
        })
        return pendingTests.length > 0
      })
    }
    if (activeTab === 'in_incubation') {
      return shipment.batches.some(b => getIncubationStatus(b, shipment.template_id).locked)
    }
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex justify-center items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500" />
      </div>
    )
  }

  if (activeBatchTesting) {
    return (
      <BatchTestingPage
        batch={activeBatchTesting.batch}
        shipment={activeBatchTesting.shipment}
        templates={templates}
        initialResults={results}
        onSave={handleSaveAllResults}
        onClose={() => setActiveBatchTesting(null)}
      />
    )
  }

  const dueBatches = shipments
    .flatMap(s => (s.batches || []).map(b => ({ ...b, template_id: s.template_id, supplier: s.supplier, template_name: getTemplate(s.template_id)?.name })))
    .filter(b => getIncubationStatus(b, b.template_id).due)

  const assignedShipments = shipments.filter(s => {
    if (isShipmentArchived(s)) return false
    const assignedIds = Array.isArray(s.assigned_to) ? s.assigned_to : []
    if (!assignedIds.includes(user.id)) return false
    
    const temp = getTemplate(s.template_id)
    return (s.batches || []).some(b => {
      if (b.approved_at || b.submitted_at) return false
      if (getIncubationStatus(b, s.template_id).locked) return false
      
      const pendingTests = (temp?.tests || []).filter(testId => {
        const test = getTestDefinition(testId, temp)
        if (!test || test.isCalculated) return false
        if (isTestLocked(testId, b, temp)) return false
        return !isTestEntered(testId, b.id, results, temp)
      })
      return pendingTests.length > 0
    })
  })

  const retestBatches = shipments
    .filter(s => {
      if (isShipmentArchived(s)) return false
      const assignedIds = Array.isArray(s.assigned_to) ? s.assigned_to : []
      return assignedIds.includes(user.id)
    })
    .flatMap(s => (s.batches || []).map(b => ({ ...b, template_id: s.template_id, supplier: s.supplier, template_name: getTemplate(s.template_id)?.name })))
    .filter(b => b.retest_requested_at)

  const notifications = [
    ...dueBatches.map(b => ({
      id: `incubation:${b.id}`,
      type: 'incubation',
      title: b.template_name || t('common.product'),
      subtitle: `${t('mgr.archive.batch_label').replace('{n}', b.number || t('common.unnamed_batch'))} • ${t('mgr.archive.supplier')} ${b.supplier}`,
      badgeText: t('tech.bell.ready_badge') || t('mgr.bell.ready_badge'),
      badgeColor: 'text-amber-400 bg-amber-950/20 border border-amber-900/30',
      ping: true,
      actionData: { tab: 'pending', batchId: b.id }
    })),
    ...assignedShipments.map(s => ({
      id: `assignment:${s.id}`,
      type: 'assignment',
      title: getTemplate(s.template_id)?.name || t('common.product'),
      subtitle: `${t('mgr.intake.supplier')} ${s.supplier} • ${t('mgr.intake.arrived')} ${s.intake_date}`,
      badgeText: t('tech.dashboard.assigned_to_me'),
      badgeColor: 'text-teal-400 bg-teal-950/20 border border-teal-900/30',
      ping: false,
      actionData: { tab: 'pending', shipmentId: s.id }
    })),
    ...retestBatches.map(b => ({
      id: `retest:${b.id}`,
      type: 'retest',
      title: `${t('tech.bell.retest_title') || 'Retest Required'}: ${b.template_name || t('common.product')}`,
      subtitle: `${t('mgr.archive.batch_label').replace('{n}', b.number || t('common.unnamed_batch'))}\n${t('mgr.review.retest_label')}: ${b.retest_reason}`,
      badgeText: t('tech.bell.retest_badge') || 'Retest',
      badgeColor: 'text-red-400 bg-red-950/20 border border-red-900/30',
      ping: true,
      actionData: { tab: 'pending', batchId: b.id }
    }))
  ]

  const pendingShipmentsCount = shipments.filter(s => {
    if (isShipmentArchived(s)) return false
    
    if (myMissionsOnly) {
      const assignedIds = Array.isArray(s.assigned_to) ? s.assigned_to : []
      if (!assignedIds.includes(user.id)) return false
    }

    const temp = getTemplate(s.template_id)
    return (s.batches || []).some(b => {
      if (b.approved_at) return false
      if (getIncubationStatus(b, s.template_id).locked) return false
      
      const pendingTests = (temp?.tests || []).filter(testId => {
        const test = getTestDefinition(testId, temp)
        if (!test || test.isCalculated) return false
        if (isTestLocked(testId, b, temp)) return false
        return !isTestEntered(testId, b.id, results, temp)
      })
      return pendingTests.length > 0
    })
  }).length
  const inIncubationCount = shipments
    .filter(s => !isShipmentArchived(s))
    .flatMap(s => (s.batches || []).map(b => ({ ...b, template_id: s.template_id })))
    .filter(b => getIncubationStatus(b, b.template_id).locked)
    .length

  const technicianTabs = [
    { id: 'pending', label: `${t('tech.tab.pending').replace(' ({n})', '').replace(' {n}', '').replace('{n}', '')} (${pendingShipmentsCount})`, icon: ClipboardList },
    { id: 'in_incubation', label: `${t('tech.tab.in_incubation').replace(' ({n})', '').replace(' {n}', '').replace('{n}', '')} (${inIncubationCount})`, icon: Clock },
    { id: 'intake', label: t('tech.tab.intake'), icon: Calendar },
    { id: 'templates', label: t('tech.tab.templates'), icon: Settings },
    { id: 'archive', label: t('tech.tab.archive'), icon: Archive }
  ]

  return (
    <ResponsiveShell
      role="technician"
      profileName={profile?.name || user?.email}
      activeTab={activeTab}
      onTabChange={(tabId) => {
        setActiveTab(tabId)
        setCoaSelectedBatchId('')
      }}
      tabs={technicianTabs}
      notifications={notifications}
      onNotificationItemClick={(n) => {
        if (n.actionData?.tab) {
          setActiveTab(n.actionData.tab)
        } else {
          setActiveTab('pending')
        }
      }}
      logout={logout}
      setSettingsModalOpen={setSettingsModalOpen}
    >
      <div className="w-full max-w-6xl mx-auto px-4 mt-8 flex-1 min-w-0">


        {/* Shipments List */}
        {activeTab === 'intake' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">{t('tech.intake.title')}</h2>
              <button
                onClick={() => setShipmentModal('new')}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{t('tech.intake.log_btn')}</span>
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl divide-y divide-slate-800/60 overflow-hidden shadow-xl">
              {shipments.filter(s => !isShipmentArchived(s)).map(s => {
                const temp = getTemplate(s.template_id)
                const isExpanded = expandedIntakeShipmentId === s.id
                return (
                  <div
                    key={s.id}
                    className="transition-colors hover:bg-slate-850/20"
                  >
                    {/* Summary Bar (Gmail Style - Compact, Thin) */}
                    <div
                      onClick={() => setExpandedIntakeShipmentId(isExpanded ? null : s.id)}
                      className="p-4 cursor-pointer flex items-center justify-between gap-4 select-none"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-sm font-bold text-white truncate">{temp?.name}</h3>
                          <span className="text-[10px] text-slate-505 font-bold shrink-0">
                            ({t('tech.batch.batches_count').replace('{n}', s.batches.length)})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {t('tech.intake.supplier')} <span className="font-semibold text-slate-350">{s.supplier}</span> • 
                          {t('tech.intake.arrived')} <span className="font-semibold text-slate-350">{s.intake_date}</span>
                          {s.size && ` • ${t('tech.intake.size').replace('{s}', s.size)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShipmentModal(s)
                          }}
                          className="p-1.5 bg-slate-800 border border-slate-750 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Details Panel */}
                    {isExpanded && (
                      <div className="p-4 bg-slate-950/40 border-t border-slate-800/50 space-y-3">
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t('tech.intake.batches_section')}</p>
                        <div className="grid grid-cols-1 gap-2">
                          {s.batches.map(b => {
                            const bStatus = getIncubationStatus(b, s.template_id)
                            return (
                              <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900 border border-slate-800/80 p-2.5 rounded-xl">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-xs font-bold text-white">{b.number || t('tech.intake.unnamed')}</span>
                                  {b.approved_at && <span className="text-emerald-400 text-[10px] font-semibold">{t('tech.intake.approved')}</span>}
                                  {bStatus.required && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      bStatus.locked 
                                        ? 'bg-red-950 text-red-400 border border-red-500/20' 
                                        : bStatus.due 
                                        ? 'bg-amber-950 text-amber-400 border border-amber-500/20 animate-pulse'
                                        : 'bg-teal-950 text-teal-400 border border-teal-500/20'
                                    }`}>
                                      {bStatus.locked ? (
                                        bStatus.daysRemaining === 0 ? t('tech.intake.exits_today') :
                                        bStatus.daysRemaining === 1 ? t('tech.intake.exits_tomorrow') :
                                        t('tech.intake.exits_in').replace('{n}', bStatus.daysRemaining)
                                      ) : bStatus.due ? t('tech.intake.ready') : bStatus.label}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {bStatus.required && !bStatus.exited && (
                                    <button
                                      onClick={() => toggleIncubationUnlock(b.id, b.is_manually_unlocked)}
                                      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                                        b.is_manually_unlocked
                                          ? 'bg-amber-950/20 border-amber-500/30 text-amber-400 hover:bg-amber-900/10'
                                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                      }`}
                                    >
                                      {b.is_manually_unlocked ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                                      <span>{b.is_manually_unlocked ? t('tech.intake.relock') : t('tech.intake.unlock')}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">{t('tech.templates.title')}</h2>
            </div>

            {(() => {
              const filteredTemplates = templates.filter(t => {
                const matchesSearch = t.name.toLowerCase().includes(templateSearch.toLowerCase())
                let matchesFilter = true
                if (templateFilter === 'incubation') {
                  matchesFilter = t.requires_incubation !== false
                } else if (templateFilter === 'bypass') {
                  matchesFilter = t.requires_incubation === false
                }
                return matchesSearch && matchesFilter
              })

              return (
                <>
                  {/* Search & Filter Controls */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center bg-slate-900/50 p-4 border border-slate-800/80 rounded-3xl">
                    {/* Search Box */}
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder={t('tech.templates.search')}
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all"
                      />
                      {templateSearch && (
                        <button
                          onClick={() => setTemplateSearch('')}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-450 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Filters */}
                    <div className="flex gap-2 shrink-0 overflow-x-auto">
                      {[
                        { id: 'all', label: t('tech.templates.filter.all') },
                        { id: 'incubation', label: t('tech.templates.filter.incubation') },
                        { id: 'bypass', label: t('tech.templates.filter.bypass') }
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setTemplateFilter(f.id)}
                          className={`px-4 py-2.5 text-xs font-bold rounded-2xl border transition-all shrink-0 ${
                            templateFilter === f.id
                              ? 'bg-teal-500/10 border-teal-500 text-teal-400'
                              : 'bg-slate-950 border-slate-850 text-slate-450 hover:text-slate-200 hover:border-slate-800'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredTemplates.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-3xl">
                      {t('tech.templates.empty')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {filteredTemplates.map(template => (
                        <div
                          key={template.id}
                          className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col justify-between hover:border-slate-750 transition-all"
                        >
                          <div>
                            <div className="flex justify-between items-start gap-4">
                              <h3 className="text-base font-bold text-white">{template.name}</h3>
                            </div>
                            
                            <div className="mt-4 space-y-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('tech.templates.incubation_cycles')}</p>
                              <div className="flex gap-4 text-xs text-slate-300">
                                {template.requires_incubation !== false ? (
                                  <>
                                    <span>36°C: <strong>{t('tech.templates.days').replace('{n}', template.incubation_36)}</strong></span>
                                    <span>55°C: <strong>{t('tech.templates.days').replace('{n}', template.incubation_55)}</strong></span>
                                  </>
                                ) : (
                                  <span className="text-slate-500 italic font-semibold">{t('tech.templates.incubation_no')}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-6">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">{t('tech.templates.enabled_tests').replace('{n}', template.tests.length)}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {template.tests.map(tid => {
                                 const test = getTestDefinition(tid, template)
                                 return (
                                   <span key={tid} className="px-2 py-0.5 bg-slate-950 border border-slate-850 rounded text-[9px] font-semibold text-slate-400">
                                     {test?.name || tid}
                                   </span>
                                 )
                               })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {activeTab === 'archive' && (() => {
          const completedShipments = shipments.filter(s => s.batches.length > 0 && s.batches.every(b => b.approved_at))
          const filteredApprovedShipments = completedShipments.map(s => {
            const matchingBatches = s.batches.filter(b => {
              const temp = getTemplate(s.template_id)
              const prodName = temp?.name || ''
              const batchNum = b.number || 'Unnamed Batch'

              const matchesSearch = 
                prodName.toLowerCase().includes(coaSearch.toLowerCase()) ||
                batchNum.toLowerCase().includes(coaSearch.toLowerCase())

              if (!matchesSearch) return false

              if (coaFilterDateType !== 'all' && (coaStartDate || coaEndDate)) {
                let targetDateStr = null
                if (coaFilterDateType === 'approved_at') {
                  targetDateStr = b.approved_at ? b.approved_at.slice(0, 10) : null
                } else if (coaFilterDateType === 'intake_date') {
                  targetDateStr = s.intake_date
                } else if (coaFilterDateType === 'production_date') {
                  targetDateStr = b.production_date
                }

                if (!targetDateStr) return false

                if (coaStartDate && targetDateStr < coaStartDate) return false
                if (coaEndDate && targetDateStr > coaEndDate) return false
              }

              return true
            })

            return { ...s, matchingBatches }
          }).filter(s => s.matchingBatches.length > 0)

          return (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white no-print">{t('tech.archive.title')}</h2>

              {/* Search & Filter Controls Panel */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 no-print shadow-lg">
                <div className="flex flex-col md:flex-row gap-4 justify-between md:items-center">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t('tech.archive.search_heading')}</h3>
                  {coaSelectedBatchId && (
                    <button
                      onClick={() => setCoaSelectedBatchId('')}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-bold text-teal-400 rounded-xl transition-all cursor-pointer"
                    >
                      {t('common.filter.back')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Search box */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('common.filter.search_label')}</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={coaSearch}
                        onChange={(e) => setCoaSearch(e.target.value)}
                        placeholder={t('common.filter.search_placeholder')}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none"
                      />
                      {coaSearch && (
                        <button
                          onClick={() => setCoaSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Date type filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('common.filter.date_label')}</label>
                    <select
                      value={coaFilterDateType}
                      onChange={(e) => {
                        setCoaFilterDateType(e.target.value)
                        if (e.target.value === 'all') {
                          setCoaStartDate('')
                          setCoaEndDate('')
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                    >
                      <option value="all">{t('common.filter.all_dates')}</option>
                      <option value="approved_at">{t('common.filter.approval_date')}</option>
                      <option value="intake_date">{t('common.filter.intake_date')}</option>
                      <option value="production_date">{t('common.filter.prod_date')}</option>
                    </select>
                  </div>

                  {/* Start Date */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('common.filter.from')}</label>
                    <input
                      type="date"
                      value={coaStartDate}
                      disabled={coaFilterDateType === 'all'}
                      onChange={(e) => setCoaStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none disabled:opacity-50"
                    />
                  </div>

                  {/* End Date */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('common.filter.to')}</label>
                    <input
                      type="date"
                      value={coaEndDate}
                      disabled={coaFilterDateType === 'all'}
                      onChange={(e) => setCoaEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Active selectors list / quick clear */}
                {(coaSearch || coaFilterDateType !== 'all' || coaStartDate || coaEndDate) && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        setCoaSearch('')
                        setCoaFilterDateType('all')
                        setCoaStartDate('')
                        setCoaEndDate('')
                      }}
                      className="text-[10px] text-slate-450 hover:text-white font-bold uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      {t('common.filter.clear_btn')}
                    </button>
                  </div>
                )}
              </div>

              {/* If batch is selected, show Print/Download controls for that batch, else show selection list */}
              {coaSelectedBatchId && (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl flex justify-end gap-3 no-print">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-800 hover:border-slate-750 bg-slate-950 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>{t('common.print_btn')}</span>
                  </button>
                  <button
                    onClick={() => {
                      try {
                        const batchObj = shipments.flatMap(s => s.batches).find(b => b.id === coaSelectedBatchId)
                        if (batchObj) {
                          downloadCoaPdf(batchObj.number)
                        } else {
                          alert(t('tech.alert.batch_not_found').replace('{id}', coaSelectedBatchId))
                        }
                      } catch (err) {
                        alert(`${t('tech.alert.download_error')} ${err.message}`)
                      }
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('common.download_btn')}</span>
                  </button>
                </div>
              )}

              {coaSelectedBatchId ? (() => {
                const batch = shipments.flatMap(s => s.batches.map(b => ({ ...b, shipment: s }))).find(b => b.id === coaSelectedBatchId)
                const template = getTemplate(batch?.shipment?.template_id)
                return (
                  <COAReportView batch={batch} template={template} results={results} t={t} />
                )
              })() : (
                filteredApprovedShipments.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-3xl">
                    {t('tech.archive.empty')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {filteredApprovedShipments.map(shipment => {
                      const temp = getTemplate(shipment.template_id)

                      return (
                        <div
                          key={shipment.id}
                          className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col justify-between hover:border-slate-750 transition-all shadow-lg hover:shadow-slate-950/20 space-y-4"
                        >
                          <div>
                            <h3 className="text-base font-bold text-white">{temp?.name}</h3>
                            <p className="text-xs text-slate-400 mt-1">
                            {t('tech.batch.supplier')} <span className="font-semibold text-slate-200">{shipment.supplier}</span> • {t('tech.batch.arrived')} <span className="font-semibold text-slate-200">{shipment.intake_date}</span>
                            </p>
                          </div>

                          <div className="space-y-3 border-t border-slate-800/60 pt-4">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('tech.archive.approved_count').replace('{n}', shipment.matchingBatches.length)}</p>

                            <div className="space-y-2">
                              {shipment.matchingBatches.map(b => {
                                const formattedAppDate = b.approved_at ? new Date(b.approved_at).toLocaleDateString() : '-'
                                return (
                                  <div
                                    key={b.id}
                                    className="p-3 bg-slate-950/40 border border-slate-850 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                  >
                                    <div>
                                      <p className="text-xs font-bold text-teal-400">{t('tech.archive.batch_label').replace('{n}', b.number || t('common.unnamed_batch'))}</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">
                                        {t('tech.batch.prod')} {b.production_date || '-'} • {t('tech.batch.approved_label')} {formattedAppDate}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => setActiveBatchTesting({ batch: b, shipment })}
                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-teal-400 text-[10px] font-bold rounded-lg active:scale-[0.98] transition-all cursor-pointer font-sans"
                                      >
                                        <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
                                        <span>{t('tech.archive.view_raw_btn')}</span>
                                      </button>
                                      <button
                                        onClick={() => setCoaSelectedBatchId(b.id)}
                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 text-[10px] font-bold rounded-lg active:scale-[0.98] transition-all cursor-pointer font-sans"
                                      >
                                        <FileText className="w-3.5 h-3.5 text-slate-950" />
                                        <span>{t('tech.archive.generate_coa')}</span>
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          })()}

        {activeTab === 'pending' && (
          <div className="space-y-6">
            {/* Header with Assignment Toggle */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <h2 className="text-xl font-bold text-white">
                {t('tech.tab.pending').replace(' ({n})', '').replace('({n})', '')}
              </h2>
              
              {/* Toggle Switch */}
              <label className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-slate-900 border border-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={myMissionsOnly}
                  onChange={() => setMyMissionsOnly(!myMissionsOnly)}
                  className="sr-only"
                />
                <div dir="ltr" className={`w-8 h-4.5 rounded-full p-0.5 transition-all duration-200 ${
                  myMissionsOnly ? 'bg-teal-500' : 'bg-slate-800'
                }`}>
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-all duration-200 ${
                    myMissionsOnly ? 'translate-x-3.5' : 'translate-x-0'
                  }`} />
                </div>
                <span className="text-xs font-bold text-slate-300">
                  {t('tech.dashboard.my_missions')}
                </span>
              </label>
            </div>

            {/* Quick-Access Drafts Banner */}
            {(() => {
              const draftBatches = shipments
                .filter(s => {
                  const assignedIds = Array.isArray(s.assigned_to) ? s.assigned_to : [];
                  if (myMissionsOnly && assignedIds.length > 0 && !assignedIds.includes(user.id)) return false;
                  return true;
                })
                .flatMap(s => (s.batches || []).map(b => ({ ...b, shipment: s, template_id: s.template_id })))
                .filter(b => {
                  if (b.approved_at || b.submitted_at) return false;
                  const bStatus = getIncubationStatus(b, b.template_id);
                  if (bStatus.locked) return false;
                  return Object.keys(results).some(k => k.startsWith(b.id + ":"));
                });

              if (draftBatches.length === 0) return null;
              
              return (
                <div className="bg-slate-900 border border-amber-500/20 rounded-3xl overflow-hidden shadow-xl">
                  <div
                    className="p-5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{String.fromCodePoint(0x1F4DD)}</span>
                      <h3 className="text-sm font-bold text-amber-400">
                        {t("tech.draft.banner.title").replace("{n}", draftBatches.length)}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-bold text-amber-400">
                        {draftBatches.length}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-slate-800/60 p-4 space-y-2 bg-slate-950/20">
                      {draftBatches.map(d => {
                        const temp = getTemplate(d.template_id);
                        return (
                          <div
                            key={d.id}
                            className="flex items-center justify-between p-3 bg-slate-900 rounded-2xl border border-slate-800/80 hover:border-teal-500/20 transition-all"
                          >
                            <div>
                              <p className="text-sm font-bold text-white">{temp?.name || t("common.product")}</p>
                              <p className="text-[10px] text-slate-400">
                                {d.shipment.supplier} • {t("tech.batch.batch_label")} {d.number || t("common.unnamed_batch")}
                              </p>
                            </div>
                            <button
                              onClick={() => setActiveBatchTesting({ batch: d, shipment: d.shipment })}
                              className="px-4 py-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-400 text-[11px] font-bold rounded-xl transition-all cursor-pointer"
                            >
                              {t("tech.draft.resume_btn")}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                </div>
              );
            })()}

            {filteredShipments.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
              <FileSpreadsheet className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-300">{t('tech.batch.no_shipments')}</h3>
              <p className="text-slate-500 text-sm mt-1">
                {t('tech.batch.no_shipments_filter')}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
            {filteredShipments.map(shipment => {
              const template = getTemplate(shipment.template_id)
              const isExpanded = expandedShipmentId === shipment.id
              const lockedBatchesCount = shipment.batches.filter(b => getIncubationStatus(b, shipment.template_id).locked).length
              const requiresIncubation = template?.requires_incubation !== false && shipment.batches.some(b => (b.units_36 || 0) > 0 || (b.units_55 || 0) > 0)
              const readyBatches = shipment.batches.filter(b => !getIncubationStatus(b, shipment.template_id).locked)

              return (
                <div
                  key={shipment.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-3xl overflow-hidden transition-all duration-200 shadow-xl"
                >
                  {/* Summary Bar */}
                  <div
                    onClick={() => setExpandedShipmentId(isExpanded ? null : shipment.id)}
                    className="p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 select-none hover:bg-slate-800/10 transition-colors"
                  >
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {template?.name || t('tech.batch.unknown_product')}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        {t('tech.batch.supplier')} <span className="font-semibold text-slate-200">{shipment.supplier}</span> • 
                        {t('tech.batch.arrived')} <span className="font-semibold text-slate-200">{shipment.intake_date}</span>
                        {shipment.size && ` ${t('tech.batch.size').replace('{s}', shipment.size)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Assignment Badge */}
                      {(() => {
                        const assignedIds = Array.isArray(shipment.assigned_to) ? shipment.assigned_to : []
                        const isAssignedToMe = assignedIds.includes(user.id)
                        
                        if (isAssignedToMe) {
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-950 text-teal-400 border border-teal-500/20">
                              <span>📋</span>
                              <span>{t('tech.dashboard.assigned_to_me')}</span>
                            </span>
                          )
                        }
                        
                        if (assignedIds.length > 0) {
                          const names = assignedIds
                            .map(id => usersList.find(u => u.id === id)?.name || usersList.find(u => u.id === id)?.email || id)
                            .join(', ')
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              <span>👥</span>
                              <span>{t('tech.dashboard.assigned_to').replace('{names}', names)}</span>
                            </span>
                          )
                        }
                        
                        return (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/60 border-dashed">
                            <span>⚪</span>
                            <span>{t('tech.dashboard.unassigned')}</span>
                          </span>
                        )
                      })()}

                      {lockedBatchesCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-950/40 border border-red-500/35 text-red-400 text-xs font-bold rounded-full">
                          <Lock className="w-3.5 h-3.5" />
                          <span>{t('tech.batch.locked').replace('{n}', lockedBatchesCount)}</span>
                        </span>
                      ) : requiresIncubation ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/40 border border-emerald-500/35 text-emerald-400 text-xs font-bold rounded-full">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{t('tech.batch.incubation_done')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-950/40 border border-teal-500/35 text-teal-400 text-xs font-bold rounded-full">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{t('status.ready')}</span>
                        </span>
                      )}
                      <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full font-bold">
                        {t('tech.batch.batches_count').replace('{n}', readyBatches.length)}
                      </span>
                    </div>
                  </div>

                  {/* Shipment Details Panel */}
                  {isExpanded && (
                    <div className="p-6 border-t border-slate-800 bg-slate-950/30 space-y-6">

                      {/* Batches Table */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {t('tech.batch.entry_section')}
                        </h4>
                        
                        <div className="space-y-3">
                          {readyBatches.map(batch => {
                            const isBatchExpanded = expandedBatchId === batch.id
                            const batchResultsCount = template?.tests.filter(tid => isTestEntered(tid, batch.id, results, template)).length || 0
                            const totalTestsCount = template?.tests.length || 0
                            const bStatus = getIncubationStatus(batch, shipment.template_id)

                            return (
                                <div
                                  key={batch.id}
                                  className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden"
                                >
                                  {/* Retest request warning banner */}
                                  {batch.retest_requested_at && (
                                    <div className="bg-red-500/10 border-b border-red-500/25 px-4 py-2 flex items-center gap-2 text-xs font-bold text-red-400">
                                      <AlertCircle className="w-4 h-4 text-red-500" />
                                      <span>{t('tech.batch.retest_warning').replace('{reason}', batch.retest_reason)}</span>
                                    </div>
                                  )}

                                  <div
                                    onClick={() => setExpandedBatchId(isBatchExpanded ? null : batch.id)}
                                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 select-none cursor-pointer hover:bg-slate-800/20"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-bold text-white">{batch.number || t('common.unnamed_batch')}</span>
                                        {bStatus.required && (
                                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-950 text-teal-400 border border-teal-500/20">
                                            {bStatus.due ? t('tech.batch.ready') : bStatus.label}
                                          </span>
                                        )}{/* Draft badge */}{!batch.approved_at && !batch.submitted_at && !getIncubationStatus(batch, shipment.template_id).locked && Object.keys(results).some(k => k.startsWith(batch.id + ':')) && (
                                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-500/20">
                                            {String.fromCodePoint(0x1F4DD) + ' ' + t('tech.draft.badge')}
                                          </span>
                                        )}

                                        {/* Mobile-only status badge inline */}
                                        <span className="inline-block md:hidden">
                                          {batchResultsCount === totalTestsCount ? (
                                            <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20">
                                              {t('tech.batch.status.complete')}
                                            </span>
                                          ) : batchResultsCount > 0 ? (
                                            <span className="px-2 py-0.5 bg-amber-950 text-amber-400 text-[10px] font-bold rounded border border-amber-500/20">
                                              {t('tech.batch.status.in_progress')}
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] font-bold rounded border border-slate-700">
                                              {t('tech.batch.status.pending')}
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                                        {t('tech.batch.prod')} {batch.production_date || '-'} • {t('tech.batch.exp')} {batch.expiration_date || '-'}
                                        {bStatus.required && (
                                          <span className="block sm:inline"> • Units: 36°C: {batch.units_36 || 0} | 55°C: {batch.units_55 || 0}</span>
                                        )}
                                      </p>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between md:justify-end gap-3 mt-2 md:mt-0 pt-2 md:pt-0 border-t border-slate-800/40 md:border-t-0 w-full md:w-auto">
                                      <div className="hidden md:flex items-center gap-2">
                                        <span className="text-xs text-slate-400 font-medium">
                                          {t('tech.batch.tests_progress').replace('{n}', batchResultsCount).replace('{total}', totalTestsCount)}
                                        </span>
                                        {batchResultsCount === totalTestsCount ? (
                                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20">
                                            {t('tech.batch.status.complete')}
                                          </span>
                                        ) : batchResultsCount > 0 ? (
                                          <span className="px-2 py-0.5 bg-amber-950 text-amber-400 text-[10px] font-bold rounded border border-emerald-500/20">
                                            {t('tech.batch.status.in_progress')}
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] font-bold rounded border border-slate-700">
                                            {t('tech.batch.status.pending')}
                                          </span>
                                        )}
                                      </div>

                                      <span className="md:hidden text-[10px] text-slate-450 font-bold uppercase">
                                        {t('tech.batch.tests_progress').replace('{n}', batchResultsCount).replace('{total}', totalTestsCount)}
                                      </span>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setActiveBatchTesting({ batch, shipment })
                                        }}
                                        className={`px-4 py-2.5 md:py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer w-full sm:w-auto text-center ${
                                          batchResultsCount === totalTestsCount
                                            ? 'bg-slate-800 hover:bg-slate-750 text-teal-400 border border-slate-700'
                                            : 'bg-teal-500 hover:bg-teal-400 text-slate-950'
                                        }`}
                                      >
                                        {batchResultsCount > 0 ? t('tech.batch.edit_results') : t('tech.batch.enter_results')}
                                      </button>
                                    </div>
                                  </div>
                                  {isBatchExpanded && (
                                    <div className="p-4 border-t border-slate-850 bg-slate-950/20 space-y-4">
                                      <div className="flex justify-between items-center">
                                        <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">{t('tech.batch.results_summary')}</p>
                                        <button
                                          onClick={() => setActiveBatchTesting({ batch, shipment })}
                                          className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-teal-400 border border-slate-700 rounded-lg transition-all cursor-pointer"
                                        >
                                          <Edit className="w-3.5 h-3.5" />
                                          <span>{t('tech.batch.edit_results')}</span>
                                        </button>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {template?.tests.map(testId => {
                                          const test = getTestDefinition(testId, template)
                                          if (!test) return null

                                          const repData = results[`${batch.id}:${testId}`] || []
                                          const isEntered = isTestEntered(testId, batch.id, results, template)

                                          const batchResults = {}
                                          if (template?.tests) {
                                            template.tests.forEach(tid => {
                                              batchResults[tid] = results[`${batch.id}:${tid}`] || []
                                            })
                                          }
                                          const calc = calculateTest(testId, repData, batchResults, test)

                                          return (
                                            <div
                                              key={testId}
                                              className="p-3 bg-slate-900 border border-slate-800/80 rounded-xl flex items-center justify-between"
                                            >
                                              <div>
                                                <p className="text-xs font-semibold text-white">{test.name}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                  {isEntered ? (
                                                    <span className="text-teal-400 font-semibold">{calc.label}</span>
                                                  ) : (
                                                    <span className="text-slate-500 italic">{t('tech.batch.no_data')}</span>
                                                  )}
                                                </p>
                                              </div>
                                              {isEntered && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-950 text-slate-400 border border-slate-850 rounded">
                                                  {repData.length > 0 ? t('tech.batch.reps').replace('{n}', repData.length) : t('tech.batch.auto')}
                                                </span>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          )}
        </div>
      )}

        {activeTab === 'in_incubation' && (
          filteredShipments.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
              <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-300">{t('incubation.empty')}</h3>
            </div>
          ) : (
            <div className="space-y-6">
            {filteredShipments.map(shipment => {
              const template = getTemplate(shipment.template_id)
              const isExpanded = expandedShipmentId === shipment.id
              const lockedBatches = shipment.batches.filter(b => getIncubationStatus(b, shipment.template_id).locked)

              return (
                <div
                  key={shipment.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-3xl overflow-hidden transition-all duration-200 shadow-xl"
                >
                  {/* Summary Bar */}
                  <div
                    onClick={() => setExpandedShipmentId(isExpanded ? null : shipment.id)}
                    className="p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 select-none hover:bg-slate-800/10 transition-colors"
                  >
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {template?.name || t('tech.batch.unknown_product')}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        {t('tech.batch.supplier')} <span className="font-semibold text-slate-200">{shipment.supplier}</span> • 
                        {t('tech.batch.arrived')} <span className="font-semibold text-slate-200">{shipment.intake_date}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-950/40 border border-red-500/35 text-red-400 text-xs font-bold rounded-full">
                        <Lock className="w-3.5 h-3.5" />
                        <span>{t('tech.batch.locked').replace('{n}', lockedBatches.length)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Shipment Details Panel */}
                  {isExpanded && (
                    <div className="p-6 border-t border-slate-800 bg-slate-950/30 space-y-6">
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {t('incubation.title')}
                        </h4>
                        
                        <div className="space-y-4">
                          {lockedBatches.map(batch => {
                            const needs36 = (batch.units_36 || 0) > 0 && (template?.incubation_36 || 0) > 0
                            const needs55 = (batch.units_55 || 0) > 0 && (template?.incubation_55 || 0) > 0

                            return (
                              <div
                                key={batch.id}
                                className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">{batch.number || t('common.unnamed_batch')}</span>
                                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-950 text-red-400 border border-red-500/20 flex items-center gap-1">
                                      <Lock className="w-2.5 h-2.5" />
                                      {t('status.in_incubation')}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-medium">
                                    {t('tech.batch.prod')} {batch.production_date || '-'} • {t('tech.batch.exp')} {batch.expiration_date || '-'}
                                  </p>
                                </div>

                                {/* Incubator Cycles Breakdown */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1 pt-3 border-t border-slate-800/40">
                                  {needs36 && (
                                    <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850 flex flex-col gap-1.5">
                                      <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{t('incubation.incubator_36')}</span>
                                      <div className="flex justify-between items-center mt-1">
                                        <span className="text-xs font-semibold text-slate-200">{t('incubation.units').replace('{n}', batch.units_36)}</span>
                                        <span className="text-xs font-bold text-amber-400">{formatExitText(batch.exit_36)}</span>
                                      </div>
                                      <span className="text-[9px] text-slate-500 mt-1">{t('incubation.exit_date')} {batch.exit_36}</span>
                                    </div>
                                  )}
                                  {needs55 && (
                                    <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850 flex flex-col gap-1.5">
                                      <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{t('incubation.incubator_55')}</span>
                                      <div className="flex justify-between items-center mt-1">
                                        <span className="text-xs font-semibold text-slate-200">{t('incubation.units').replace('{n}', batch.units_55)}</span>
                                        <span className="text-xs font-bold text-amber-400">{formatExitText(batch.exit_55)}</span>
                                      </div>
                                      <span className="text-[9px] text-slate-500 mt-1">{t('incubation.exit_date')} {batch.exit_55}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          )
        )}
      </div>



      {/* Shipment Intake Modal Portal */}
      {shipmentModal && (
        <ShipmentModal
          templates={templates}
          initialShipment={shipmentModal === 'new' ? null : shipmentModal}
          onSave={handleSaveShipment}
          onClose={() => setShipmentModal(null)}
        />
      )}

      {/* ACCOUNT SETTINGS MODAL */}
      {settingsModalOpen && (
        <AccountSettingsModal
          prefix="tech.settings"
          toastPrefix="tech.toast"
          alertPrefix="tech.alert"
          user={user}
          onClose={() => setSettingsModalOpen(false)}
          updateAccount={updateAccount}
          showToast={showToast}
        />
      )}

      {/* Toast Notification */}
      {toast.visible && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-teal-950 border border-teal-500/35 text-teal-200 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
          <CheckCircle className="w-5 h-5 shrink-0 text-teal-400" />
          <span className="text-xs font-bold">{toast.message}</span>
        </div>
      )}
    </ResponsiveShell>
  )
}
