import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import { TESTS, testMap, calculateTest, isTestEntered, isShipmentArchived, fmt, num, avg, isTestLocked, getTestDefinition } from '../utils/calculations'
import { parseBatchNumber } from '../utils/batchParser'
import BatchTestingPage from './BatchTestingPage'
import LanguageToggle from './LanguageToggle'
import ShipmentModal from './ShipmentModal'
import ResponsiveShell from './ResponsiveShell'
import {
  LogOut,
  Clock,
  Lock,
  Unlock,
  ClipboardList,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  FileSpreadsheet,
  Settings,
  XCircle,
  Plus,
  Edit,
  Search,
  X,
  Archive,
  Printer,
  Download,
  FileText,
  Bell,
  Calendar
} from 'lucide-react'

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
  const [notificationBellOpen, setNotificationBellOpen] = useState(false)

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

  const handleSaveAllResults = async (upsertPayload) => {
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

      // Clear retest request if there was an active retest
      if (batch.retest_requested_at) {
        const { error: clearRetestError } = await supabase
          .from('batches')
          .update({
            retest_requested_at: null,
            retest_reason: null
          })
          .eq('id', batch.id)
        if (clearRetestError) throw clearRetestError

        setShipments(prev => prev.map(s => {
          if (s.id === batch.shipment_id) {
            return {
              ...s,
              batches: s.batches.map(b => b.id === batch.id ? { ...b, retest_requested_at: null, retest_reason: null } : b)
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
      showToast(t('tech.toast.results_saved'))
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

    const addDays = (dateStr, days) => {
      const next = new Date(dateStr + 'T00:00:00')
      next.setDate(next.getDate() + Number(days))
      return next.toISOString().slice(0, 10)
    }

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
      // Parse dynamic batch form rows
      const batchRows = Array.from(form.querySelectorAll('.batch-form-row')).map(row => {
        const numInput = row.querySelector('[name="batch_number"]').value
        const parsed = parseBatchNumber(numInput)
        const prodDate = row.querySelector('[name="production_date"]').value || (parsed.valid ? parsed.date : null)
        const expDate = row.querySelector('[name="expiration_date"]').value || null

        // Batch-level incubation details
        const u36 = Number(row.querySelector('[name="units_36"]')?.value || 0)
        const u55 = Number(row.querySelector('[name="units_55"]')?.value || 0)
        const exit36 = u36 && template?.incubation_36 ? addDays(intakeDate, template.incubation_36) : null
        const exit55 = u55 && template?.incubation_55 ? addDays(intakeDate, template.incubation_55) : null

        const batchId = row.dataset.id
        const existingBatch = isNew ? null : (shipmentModal.batches || []).find(b => b.id === batchId)

        const uuidv4 = () => {
          if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID()
          }
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        }

        return {
          id: batchId || uuidv4(),
          shipment_id: shipmentId,
          number: numInput ? numInput.trim() : null,
          production_date: prodDate,
          expiration_date: expDate,
          units_36: u36,
          units_55: u55,
          exit_36: exit36,
          exit_55: exit55,
          is_manually_unlocked: existingBatch ? existingBatch.is_manually_unlocked : false,
          incubation_exited_at: existingBatch ? existingBatch.incubation_exited_at : null,
          incubation_removed_early_at: existingBatch ? existingBatch.incubation_removed_early_at : null,
          incubation_early_acknowledged_at: existingBatch ? existingBatch.incubation_early_acknowledged_at : null
        }
      })

      // Sync batches (delete removed ones, upsert active ones)
      if (!isNew) {
        const activeIds = batchRows.map(r => r.id).filter(Boolean)
        await supabase
          .from('batches')
          .delete()
          .eq('shipment_id', shipmentId)
          .not('id', 'in', `(${activeIds.join(',')})`)
      }

      const { error: batchesError } = await supabase
        .from('batches')
        .upsert(batchRows)
      if (batchesError) throw batchesError

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
    const element = document.getElementById('coa-report-view')
    if (!element) {
      alert(t('tech.alert.coa_missing'))
      return
    }

    const opt = {
      margin: 0.3,
      filename: `COA_Batch_${batchNumber || 'Unnamed'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }

    const runCdnHtml2Pdf = () => {
      const html2pdfLib = window.html2pdf
      if (!html2pdfLib) {
        alert(t('tech.alert.pdf_library'))
        return
      }
      try {
        html2pdfLib().set(opt).from(element).save()
          .catch(err => alert(`${t('tech.alert.pdf_save_error')} ${err.message}`))
      } catch (err) {
        alert(`${t('tech.alert.pdf_execution_error')} ${err.message}`)
      }
    }

    const loadCdnFallback = () => {
      if (window.html2pdf) {
        runCdnHtml2Pdf()
        return
      }
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.14.0/dist/html2pdf.bundle.min.js'
      script.onload = runCdnHtml2Pdf
      script.onerror = () => alert(t('tech.alert.pdf_load_failed'))
      document.body.appendChild(script)
    }

    loadCdnFallback()
  }

  // Helpers
  const getTemplate = (id) => templates.find(t => t.id === id)

  const getIncubationStatus = (batch, templateId) => {
    const template = getTemplate(templateId)
    if (!template || !batch) return { required: false, locked: false, label: t('status.ready') }
    
    if (template.requires_incubation === false) {
      return { required: false, locked: false, label: t('status.ready') }
    }

    const needs36 = (batch.units_36 || 0) > 0 && (template.incubation_36 || 0) > 0
    const needs55 = (batch.units_55 || 0) > 0 && (template.incubation_55 || 0) > 0
    const required = needs36 || needs55

    // If manual unlock by admin is active, it overrides all incubation blocks
    if (batch.is_manually_unlocked) {
      return { required, locked: false, label: t('status.unlocked_admin') || t('status.unlocked_override') }
    }

    const exited = !!(batch.incubation_exited_at || batch.incubation_removed_early_at)
    
    // Check if target date is reached
    const today = new Date().toISOString().slice(0, 10)
    const due36 = needs36 ? (batch.exit_36 && batch.exit_36 <= today) : false
    const due55 = needs55 ? (batch.exit_55 && batch.exit_55 <= today) : false

    const is36Locked = needs36 && !due36 && !exited
    const is55Locked = needs55 && !due55 && !exited

    // The batch as a whole is locked only if ALL configured chambers are still locked
    const locked = required && !exited && (needs36 ? is36Locked : true) && (needs55 ? is55Locked : true)
    
    // The batch is due if any are due and not yet exited
    const due = required && !exited && (due36 || due55)

    let label = t('status.ready')
    if (required) {
      if (exited) {
        label = t('status.exited')
      } else if (is36Locked && is55Locked) {
        label = t('status.in_incubation')
      } else if (!is36Locked && is55Locked) {
        label = t('status.partial_36_exited') || '36°C Exited / 55°C Incubating'
      } else if (is36Locked && !is55Locked) {
        label = t('status.partial_55_exited') || '55°C Exited / 36°C Incubating'
      } else {
        label = t('status.due')
      }
    }

    let daysRemaining = 0
    if (locked) {
      const activeExits = []
      if (is36Locked && batch.exit_36) activeExits.push(new Date(batch.exit_36))
      if (is55Locked && batch.exit_55) activeExits.push(new Date(batch.exit_55))
      
      if (activeExits.length > 0) {
        const latestExit = new Date(Math.max(...activeExits))
        const todayDate = new Date(today)
        const diffTime = latestExit.getTime() - todayDate.getTime()
        daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
      }
    }

    return { required, locked, due, exited, label, daysRemaining, is36Locked, is55Locked }
  }

  const getDaysRemainingForDate = (exitDateStr) => {
    if (!exitDateStr) return null
    const today = new Date().toISOString().slice(0, 10)
    const todayDate = new Date(today)
    const exitDate = new Date(exitDateStr)
    const diffTime = exitDate.getTime() - todayDate.getTime()
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
  }

  const formatExitText = (exitDateStr) => {
    const days = getDaysRemainingForDate(exitDateStr)
    if (days === null) return ''
    if (days === 0) return t('tech.batch.exits_today')
    if (days === 1) return t('tech.batch.exits_tomorrow')
    return t('tech.batch.exits_in').replace('{n}', days)
  }

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
                            <p className="text-xs text-slate-500 mt-1">{template.packaging || t('tech.templates.no_packaging')}</p>
                            
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

              {coaSelectedBatchId ? (
                <div className="w-full overflow-x-auto scrollbar-none pb-6 no-print">
                  <div id="coa-report-view" className="p-8 bg-white text-slate-900 border border-slate-300 rounded-3xl w-[700px] sm:w-auto max-w-3xl mx-auto shadow-xl flex flex-col justify-between min-h-[9.2in] shrink-0">
                  {/* COA Top Header */}
                  <div>
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
                      <div>
                        <h1 className="text-2xl font-black uppercase text-slate-950">{t('coa.title')}</h1>
                        <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">
                          {t('coa.lab_name')}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="inline-block px-3 py-1 bg-slate-900 text-white text-[10px] font-bold uppercase rounded">
                          {t('coa.approved_badge')}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-medium">
                          {t('coa.release_date').replace('{d}', new Date(shipments.flatMap(s => s.batches).find(b => b.id === coaSelectedBatchId)?.approved_at).toLocaleDateString())}
                        </p>
                      </div>
                    </div>

                    {/* Metadata Table */}
                    {(() => {
                      const batch = shipments.flatMap(s => s.batches.map(b => ({ ...b, shipment: s }))).find(b => b.id === coaSelectedBatchId)
                      const temp = getTemplate(batch?.shipment?.template_id)
                      return (
                        <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-xs mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase block">{t('coa.field.product')}</span>
                            <span className="font-extrabold text-slate-900">{temp?.name}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase block">{t('coa.field.batch')}</span>
                            <span className="font-extrabold text-slate-900">{batch?.number || t('coa.unnamed_batch')}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase block">{t('coa.field.supplier')}</span>
                            <span className="font-medium text-slate-900">{batch?.shipment?.supplier}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase block">{t('coa.field.prod_date')}</span>
                            <span className="font-medium text-slate-900">{batch?.production_date || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase block">{t('coa.field.exp_date')}</span>
                            <span className="font-medium text-slate-900">{batch?.expiration_date || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase block">{t('coa.field.intake_date')}</span>
                            <span className="font-medium text-slate-900">{batch?.shipment?.intake_date}</span>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Results Table */}
                    <table className="w-full text-left border-collapse text-xs border border-slate-200">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
                          <th className="p-3 w-2/5 text-white">{t('coa.table.parameter')}</th>
                          <th className="p-3 w-2/5 text-center text-white">{t('coa.table.replicates')}</th>
                          <th className="p-3 w-1/5 text-right text-white">{t('coa.table.result')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const batch = shipments.flatMap(s => s.batches).find(b => b.id === coaSelectedBatchId)
                          if (!batch) return null
                          const shipment = shipments.find(s => s.id === batch.shipment_id)
                          const temp = getTemplate(shipment?.template_id)
                          const batchResults = {}
                          if (temp?.tests) {
                            temp.tests.forEach(tid => {
                              batchResults[tid] = results[`${batch.id}:${tid}`] || []
                            })
                          }

                          return temp?.tests.map(tid => {
                            const test = getTestDefinition(tid, temp)
                            if (!test) return null
                            const repData = results[`${batch.id}:${tid}`] || []
                            const calc = calculateTest(tid, repData, batchResults, test)

                            if (tid === 'weight') {
                              const avgGross = avg(repData.map(r => num(r.gross)))
                              const avgNet = avg(repData.map(r => num(r.net)))
                              const firstTare = repData.find(r => r.tare !== undefined && r.tare !== null && r.tare !== '')?.tare
                              const tareVal = firstTare !== undefined ? num(firstTare) : NaN

                              const grossLabel = Number.isFinite(avgGross) ? `${fmt(avgGross)} g` : '-'
                              const tareLabel = Number.isFinite(tareVal) ? `${fmt(tareVal)} g` : '-'
                              const netLabel = Number.isFinite(avgNet) ? `${fmt(avgNet)} g` : '-'

                              const grossVals = repData.map(r => num(r.gross)).filter(Number.isFinite)
                              const netVals = repData.map(r => num(r.net)).filter(Number.isFinite)

                              return (
                                <React.Fragment key={tid}>
                                  <tr className="border-b border-slate-150">
                                    <td className="p-3 font-semibold text-slate-800">{t('coa.weight.avg_gross')}</td>
                                    <td className="p-3 text-center text-slate-800 font-semibold">
                                      {grossVals.length > 0 ? grossVals.map(v => fmt(v)).join(', ') : '-'}
                                    </td>
                                    <td className="p-3 text-right font-bold text-slate-950">{grossLabel}</td>
                                  </tr>
                                  <tr className="border-b border-slate-150">
                                    <td className="p-3 font-semibold text-slate-800">{t('coa.weight.tare')}</td>
                                    <td className="p-3 text-center text-slate-800 font-semibold">-</td>
                                    <td className="p-3 text-right font-bold text-slate-950">{tareLabel}</td>
                                  </tr>
                                  <tr className="border-b border-slate-150 last:border-0">
                                    <td className="p-3 font-semibold text-slate-800">{t('coa.weight.avg_net')}</td>
                                    <td className="p-3 text-center text-slate-800 font-semibold">
                                      {netVals.length > 0 ? netVals.map(v => fmt(v)).join(', ') : '-'}
                                    </td>
                                    <td className="p-3 text-right font-bold text-slate-950">{netLabel}</td>
                                  </tr>
                                </React.Fragment>
                              )
                            }

                            const values = calc.values || []
                            const hasReplicates = values.length > 0 && test.kind !== 'qualitative' && !test.isCalculated

                            return (
                              <tr key={tid} className="border-b border-slate-150 last:border-0">
                                <td className="p-3 font-semibold text-slate-800">{test.name}</td>
                                <td className="p-3 text-center text-slate-800 font-semibold">
                                  {hasReplicates ? values.map(v => fmt(v)).join(', ') : '-'}
                                </td>
                                <td className="p-3 text-right font-bold text-slate-950">{calc.label}</td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* COA Bottom Signoff Footer */}
                  <div className="border-t border-slate-200 pt-6 mt-auto">
                    <div className="flex justify-between items-end">
                      <div className="text-[10px] text-slate-500 font-medium max-w-sm">
                        {t('coa.disclaimer')}
                      </div>
                      <div className="text-right">
                        <div className="w-36 border-b border-slate-400 mb-2 h-8" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                          {t('coa.signature')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
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
                                    <button
                                      onClick={() => setCoaSelectedBatchId(b.id)}
                                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-955 text-[10px] font-bold rounded-lg active:scale-[0.98] transition-all cursor-pointer font-sans"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-slate-955" />
                                      <span>{t('tech.archive.generate_coa')}</span>
                                    </button>
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
                                            : 'bg-teal-500 hover:bg-teal-450 text-slate-950'
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
                                                    <span className="text-teal-450 font-semibold">{calc.label}</span>
                                                  ) : (
                                                    <span className="text-slate-500 italic">{t('tech.batch.no_data')}</span>
                                                  )}
                                                </p>
                                              </div>
                                              {isEntered && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-950 text-slate-400 border border-slate-855 rounded">
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
                                    <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-855 flex flex-col gap-1.5">
                                      <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{t('incubation.incubator_36')}</span>
                                      <div className="flex justify-between items-center mt-1">
                                        <span className="text-xs font-semibold text-slate-200">{t('incubation.units').replace('{n}', batch.units_36)}</span>
                                        <span className="text-xs font-bold text-amber-400">{formatExitText(batch.exit_36)}</span>
                                      </div>
                                      <span className="text-[9px] text-slate-500 mt-1">{t('incubation.exit_date')} {batch.exit_36}</span>
                                    </div>
                                  )}
                                  {needs55 && (
                                    <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-855 flex flex-col gap-1.5">
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

function AccountSettingsModal({ user, onClose, updateAccount, showToast }) {
  const { t } = useLanguage()
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await updateAccount(email, password || null)
      showToast(t('tech.toast.account_updated'), 'success')
      onClose()
    } catch (err) {
      alert(`${t('tech.alert.account_update_error')} ${err.message}`)
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
          <h2 className="text-lg font-bold text-white">{t('tech.settings.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('tech.settings.email')}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('tech.settings.password')}</label>
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
            {t('tech.settings.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-teal-500 hover:bg-teal-400 disabled:bg-teal-500/50 text-slate-950 text-xs font-bold rounded-xl transition-all"
          >
            {loading ? t('tech.settings.saving') : t('tech.settings.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
