import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import { TESTS, testMap, calculateTest, fmt, isTestEntered, isShipmentArchived, num, avg, isTestLocked, getTestDefinition } from '../utils/calculations'
import { parseBatchNumber } from '../utils/batchParser'
import ShipmentModal from './ShipmentModal'
import LanguageToggle from './LanguageToggle'
import ResponsiveShell from './ResponsiveShell'
import {
  LogOut,
  LayoutDashboard,
  Calendar,
  FileSpreadsheet,
  FileText,
  Settings,
  Users,
  Printer,
  Download,
  ArrowLeft,
  AlertTriangle,
  Lock,
  Unlock,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Edit,
  UserPlus,
  Search,
  X,
  Archive,
  Bell,
  MoreVertical
} from 'lucide-react'
import html2pdf from 'html2pdf.js'

function uuidv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function ManagerView() {
  const { user, profile, logout, createTechnician, updateAccount } = useAuth()
  const { language, t } = useLanguage()
  const [activeTab, setActiveTab] = useState('dashboard') // 'dashboard' | 'intake' | 'templates' | 'review' | 'fresh_coas' | 'archive' | 'users'
  const isRtl = language === 'he'

  // Global State
  const [shipments, setShipments] = useState([])
  const [templates, setTemplates] = useState([])
  const [results, setResults] = useState({}) // batchId:testId -> replicates list
  const [usersList, setUsersList] = useState([])
  const [loading, setLoading] = useState(true)

  // Forms & Modal State
  const [shipmentModal, setShipmentModal] = useState(null) // { id, template_id, ... } or 'new'
  const [templateModal, setTemplateModal] = useState(null) // { id, name, ... } or 'new'
  const [activeUserMenuId, setActiveUserMenuId] = useState(null)
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [userMsg, setUserMsg] = useState({ type: '', text: '' })

  // COA print select
  const [coaSelectedBatchId, setCoaSelectedBatchId] = useState('')
  const [coaSearch, setCoaSearch] = useState('')
  const [coaFilterDateType, setCoaFilterDateType] = useState('all') // 'all' | 'approved_at' | 'intake_date' | 'production_date'
  const [coaStartDate, setCoaStartDate] = useState('')
  const [coaEndDate, setCoaEndDate] = useState('')
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all') // 'all' | 'incubation' | 'bypass'

  // Retest & Settings modal state
  const [retestInputBatchId, setRetestInputBatchId] = useState(null)
  const [retestReason, setRetestReason] = useState('')
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  // Assignment Modal State
  const [assigningShipment, setAssigningShipment] = useState(null)
  const [selectedTechs, setSelectedTechs] = useState([])

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type })
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }))
    }, 3000)
  }

  const [notifiedBatchIds, setNotifiedBatchIds] = useState([])
  const [notificationBellOpen, setNotificationBellOpen] = useState(false)
  const [expandedShipmentId, setExpandedShipmentId] = useState(null)
  const [expandedIntakeShipmentId, setExpandedIntakeShipmentId] = useState(null)

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
            new Notification(t('mgr.notif.title'), {
              body: t('mgr.notif.body').replace('{product}', b.template_name || t('common.product')).replace('{n}', b.number || t('common.unnamed_batch')),
              tag: b.id
            })
          }
          // Trigger in-app toast
          showToast(t('mgr.toast.incubation_ready').replace('{product}', b.template_name || t('common.product')).replace('{n}', b.number || t('common.unnamed_batch')), 'info')
          
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
        .order('created_at', { ascending: false })
      setTemplates(templatesData || [])

      // 2. Fetch shipments
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
        .order('created_at', { ascending: false })
      setUsersList(profilesData || [])
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }



  // --- MANAGER ACTIONS ---

  // User provisioning
  const handleRegisterUser = async (e) => {
    e.preventDefault()
    setUserMsg({ type: '', text: '' })
    try {
      await createTechnician(newUserName, newUserEmail, newUserPassword)
      setUserMsg({ type: 'success', text: t('mgr.toast.tech_created').replace('{name}', newUserName || newUserEmail) })
      setNewUserName('')
      setNewUserEmail('')
      setNewUserPassword('')
      // Refresh list
      const { data: profilesData } = await supabase.from('profiles').select('*')
      setUsersList(profilesData || [])
    } catch (err) {
      setUserMsg({ type: 'error', text: err.message })
    }
  }

  const toggleUserRole = async (userId, currentRole) => {
    const nextRole = currentRole === 'manager' ? 'technician' : 'manager'
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: nextRole })
        .eq('id', userId)
      if (error) throw error
      
      // Update local state
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role: nextRole } : u))
      
      // Show toast confirmation
      const userObj = usersList.find(u => u.id === userId)
      showToast(nextRole === 'manager' ? t('mgr.toast.role_changed_manager').replace('{email}', userObj?.email || 'user') : t('mgr.toast.role_changed_technician').replace('{email}', userObj?.email || 'user'))
    } catch (err) {
      alert(`${t('mgr.alert.user_role_error')} ${err.message}`)
    }
  }

  const handleDeleteUser = async (userId, userEmail) => {
    const confirmed = window.confirm(
      t('mgr.confirm.delete_user').replace('{email}', userEmail)
    )
    if (!confirmed) return

    try {
      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: userId
      })
      if (error) throw error

      setUsersList(prev => prev.filter(u => u.id !== userId))
      showToast(t('mgr.toast.user_deleted').replace('{email}', userEmail))
    } catch (err) {
      alert(`${t('mgr.alert.user_delete_error')} ${err.message}`)
    }
  }

  const handleSaveAssignment = async () => {
    if (!assigningShipment) return
    try {
      const { error } = await supabase
        .from('shipments')
        .update({ assigned_to: selectedTechs })
        .eq('id', assigningShipment.id)
      
      if (error) throw error
      
      // Update local state
      setShipments(prev => prev.map(s => s.id === assigningShipment.id ? { ...s, assigned_to: selectedTechs } : s))
      showToast(t('mgr.toast.assignment_saved'))
      setAssigningShipment(null)
    } catch (err) {
      alert(`Error updating assignment: ${err.message}`)
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
    } catch (err) {
      alert(`${t('mgr.alert.shipment_save_error')} ${err.message}`)
    }
  }

  // Template Actions
  const handleSaveTemplate = async (e) => {
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form))
    const isNew = templateModal === 'new'

    const selectedTests = Array.from(form.querySelectorAll('[name="tests"]:checked')).map(el => el.value)
    
    // Extract standards
    const standards = {}
    selectedTests.forEach(testId => {
      const minEl = form.querySelector(`[name="min:${testId}"]`)
      const maxEl = form.querySelector(`[name="max:${testId}"]`)
      const minVal = minEl ? minEl.value : ''
      const maxVal = maxEl ? maxEl.value : ''
      if (minVal !== '' || maxVal !== '') {
        standards[testId] = {
          min: minVal !== '' ? Number(minVal) : null,
          max: maxVal !== '' ? Number(maxVal) : null
        }
      }
    })

    // Save custom tests list
    const customTests = data.customTestsJson ? JSON.parse(data.customTestsJson) : []
    standards._customTests = customTests

    const requiresInc = form.querySelector('[name="requires_incubation"]').checked

    try {
      const payload = {
        name: data.name,
        packaging: data.packaging || null,
        requires_incubation: requiresInc,
        incubation_36: requiresInc ? Number(data.incubation_36 || 0) : 0,
        incubation_55: requiresInc ? Number(data.incubation_55 || 0) : 0,
        tests: selectedTests,
        standards
      }

      if (isNew) {
        await supabase.from('product_templates').insert(payload)
      } else {
        await supabase.from('product_templates').update(payload).eq('id', templateModal.id)
      }

      setTemplateModal(null)
      fetchData()
    } catch (err) {
      alert(`${t('mgr.alert.template_save_error')} ${err.message}`)
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
      alert(`${t('mgr.alert.override_error')} ${err.message}`)
    }
  }

  // Approve Batch Flow
  const approveBatch = async (batchId) => {
    const batchObj = shipments.flatMap(s => s.batches).find(b => b.id === batchId)
    if (!batchObj?.production_date) {
      alert(t('mgr.alert.production_missing'))
      return
    }

    // Check if all template tests are entered
    const shipmentObj = shipments.find(s => s.batches.some(b => b.id === batchId))
    const template = shipmentObj ? templates.find(t => t.id === shipmentObj.template_id) : null
    const totalTests = template?.tests || []
    const enteredTests = totalTests.filter(tid => isTestEntered(tid, batchId, results))
    const isReady = enteredTests.length === totalTests.length

    if (!isReady) {
      const confirmProceed = window.confirm(t('mgr.confirm.incomplete_approve'))
      if (!confirmProceed) return
    }

    try {
      const { error } = await supabase
        .from('batches')
        .update({ approved_at: new Date().toISOString() })
        .eq('id', batchId)
      if (error) throw error
      showToast(t('mgr.toast.batch_approved'), 'success')
      await fetchData()
      setActiveTab('fresh_coas')
      setCoaSelectedBatchId(batchId)
    } catch (err) {
      alert(`${t('mgr.alert.approve_error')} ${err.message}`)
    }
  }

  // Submit Retest Request
  const submitRetestRequest = async (batchId) => {
    if (!retestReason.trim()) {
      alert(t('mgr.alert.retest_reason'))
      return
    }

    // Check if all template tests are entered
    const shipmentObj = shipments.find(s => s.batches.some(b => b.id === batchId))
    const template = shipmentObj ? templates.find(t => t.id === shipmentObj.template_id) : null
    const totalTests = template?.tests || []
    const enteredTests = totalTests.filter(tid => isTestEntered(tid, batchId, results))
    const isReady = enteredTests.length === totalTests.length

    if (!isReady) {
      const confirmProceed = window.confirm(t('mgr.confirm.incomplete_retest'))
      if (!confirmProceed) return
    }

    try {
      const { error } = await supabase
        .from('batches')
        .update({
          retest_requested_at: new Date().toISOString(),
          retest_reason: retestReason.trim()
        })
        .eq('id', batchId)
      if (error) throw error
      setRetestInputBatchId(null)
      setRetestReason('')
      fetchData()
      showToast(t('mgr.toast.retest_submitted'), 'success')
    } catch (err) {
      alert(`${t('mgr.alert.retest_submit_error')} ${err.message}`)
    }
  }

  // Generate PDF client-side
  const downloadCoaPdf = (batchNumber) => {
    const element = document.getElementById('coa-report-view')
    if (!element) {
      alert(t('mgr.alert.coa_missing'))
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
        alert(t('mgr.alert.pdf_library'))
        return
      }
      try {
        html2pdfLib().set(opt).from(element).save()
          .catch(err => alert(`${t('mgr.alert.pdf_save_error')} ${err.message}`))
      } catch (err) {
        alert(`${t('mgr.alert.pdf_execution_error')} ${err.message}`)
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
      script.onerror = () => alert(t('mgr.alert.pdf_load_failed'))
      document.body.appendChild(script)
    }

    // Try local bundle first
    try {
      const html2pdfFn = html2pdf.default || html2pdf
      if (typeof html2pdfFn === 'function') {
        html2pdfFn().set(opt).from(element).save()
          .catch(err => {
            console.warn('Local html2pdf save failed, trying CDN fallback...', err)
            loadCdnFallback()
          })
      } else {
        throw new Error(t('mgr.alert.pdf_local_unresolved'))
      }
    } catch (err) {
      console.warn('Local html2pdf execution failed, attempting CDN fallback. Error:', err.message)
      loadCdnFallback()
    }
  }

  // --- RENDER HEPLERS ---
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

    if (batch.is_manually_unlocked) {
      return { required, locked: false, label: t('status.unlocked_override') || t('status.unlocked_admin') }
    }

    const exited = !!(batch.incubation_exited_at || batch.incubation_removed_early_at)
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

  const checkWithinStandard = (template, testId, calcResult) => {
    const standard = template?.standards?.[testId]
    if (!standard || !Number.isFinite(calcResult.average)) return true
    
    if (standard.min !== null && standard.min !== undefined && calcResult.average < standard.min) return false
    if (standard.max !== null && standard.max !== undefined && calcResult.average > standard.max) return false
    return true
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex justify-center items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500" />
      </div>
    )
  }

  const dueBatches = shipments
    .flatMap(s => (s.batches || []).map(b => ({ ...b, template_id: s.template_id, supplier: s.supplier, template_name: getTemplate(s.template_id)?.name })))
    .filter(b => getIncubationStatus(b, b.template_id).due)

  const freshCoasCount = shipments
    .flatMap(s => s.batches || [])
    .filter(b => {
      if (!b.approved_at) return false
      const age = Date.now() - new Date(b.approved_at).getTime()
      return age <= 24 * 60 * 60 * 1000
    }).length

  const lockedBatchesCount = shipments
    .filter(s => !isShipmentArchived(s))
    .flatMap(s => (s.batches || []).map(b => ({ ...b, template_id: s.template_id })))
    .filter(b => getIncubationStatus(b, b.template_id).locked)
    .length

  const awaitingTestingCount = shipments
    .filter(s => !isShipmentArchived(s))
    .flatMap(s => (s.batches || []).map(b => ({ ...b, template_id: s.template_id })))
    .filter(b => {
      if (b.approved_at) return false
      const temp = getTemplate(b.template_id)
      if (getIncubationStatus(b, b.template_id).locked) return false
      
      const pendingTests = (temp?.tests || []).filter(testId => {
        const test = getTestDefinition(testId, temp)
        if (!test || test.isCalculated) return false
        if (isTestLocked(testId, b, temp)) return false
        return !isTestEntered(testId, b.id, results, temp)
      })
      return pendingTests.length > 0
    })
    .length

  const managerTabs = [
    { id: 'dashboard', label: t('mgr.tab.overview'), icon: LayoutDashboard },
    { id: 'in_incubation', label: `${t('mgr.tab.in_incubation').replace(' ({n})', '').replace(' {n}', '').replace('{n}', '')} (${lockedBatchesCount})`, icon: Clock },
    { id: 'intake', label: t('mgr.tab.intake'), icon: Calendar },
    { id: 'templates', label: t('mgr.tab.templates'), icon: Settings },
    { id: 'review', label: t('mgr.tab.review'), icon: CheckCircle },
    { id: 'fresh_coas', label: `${t('mgr.tab.recent_coas')}${freshCoasCount > 0 ? ` (${freshCoasCount})` : ''}`, icon: FileText },
    { id: 'archive', label: t('mgr.header.archive'), icon: Archive },
    { id: 'users', label: t('mgr.tab.users'), icon: Users }
  ]

  return (
    <ResponsiveShell
      role="manager"
      profileName={profile?.name || user?.email}
      activeTab={activeTab}
      onTabChange={(tabId) => {
        setActiveTab(tabId)
        setCoaSelectedBatchId('')
      }}
      tabs={managerTabs}
      dueBatches={dueBatches}
      onNotificationItemClick={(b) => {
        setActiveTab('dashboard')
      }}
      logout={logout}
      setSettingsModalOpen={setSettingsModalOpen}
    >
      <div className="p-4 lg:p-8 w-full min-w-0">
          {/* OVERVIEW METRICS */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white mb-2">{t('mgr.overview.title')}</h2>
              
              <div className="grid grid-cols-2 gap-3 sm:gap-6 max-w-2xl">
                <button
                  onClick={() => setActiveTab('review')}
                  className="p-3 sm:p-4 bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl flex items-center justify-between transition-all text-start w-full cursor-pointer group active:scale-[0.98] shadow-md hover:shadow-lg hover:shadow-slate-950/20 focus:outline-none"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider group-hover:text-amber-400 transition-colors">
                      {t('mgr.overview.awaiting')}
                    </span>
                    <span className="text-xl sm:text-3xl font-black text-white block">
                      {awaitingTestingCount}
                    </span>
                  </div>
                  <div className="p-1.5 sm:p-2 bg-amber-500/10 rounded-xl text-amber-500 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all shrink-0 ml-2">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('in_incubation')}
                  className="p-3 sm:p-4 bg-slate-900 border border-slate-800 hover:border-teal-500/40 rounded-2xl flex items-center justify-between transition-all text-start w-full cursor-pointer group active:scale-[0.98] shadow-md hover:shadow-lg hover:shadow-slate-950/20 focus:outline-none"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider group-hover:text-teal-400 transition-colors">
                      {t('status.in_incubation')}
                    </span>
                    <span className="text-xl sm:text-3xl font-black text-white block">
                      {lockedBatchesCount}
                    </span>
                  </div>
                  <div className="p-1.5 sm:p-2 bg-teal-500/10 rounded-xl text-teal-500 group-hover:bg-teal-500 group-hover:text-slate-950 transition-all shrink-0 ml-2">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </button>
              </div>
              {/* Pending Shipments & Assignments */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                <h3 className="text-sm font-bold text-white mb-4">{t('mgr.dashboard.pending_shipments')}</h3>
                
                {(() => {
                  const pendingShipments = shipments.filter(s => {
                    if (isShipmentArchived(s)) return false
                    
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

                  if (pendingShipments.length === 0) {
                    return <p className="text-sm text-slate-500 italic">{t('tech.batch.no_shipments')}</p>
                  }

                  return (
                    <div className="space-y-4">
                      {pendingShipments.map(s => {
                        const temp = getTemplate(s.template_id)
                        
                        // Resolve assigned technician names
                        const assignedIds = Array.isArray(s.assigned_to) ? s.assigned_to : []
                        const assignedNames = assignedIds
                          .map(id => usersList.find(u => u.id === id)?.name || usersList.find(u => u.id === id)?.email || id)
                          .join(', ')

                        return (
                          <div
                            key={s.id}
                            className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-teal-400">
                                {temp?.name || t('tech.batch.unknown_product')}
                              </h4>
                              <p className="text-xs text-slate-400 mt-1">
                                {t('common.supplier')} <span className="font-semibold text-slate-200">{s.supplier}</span> • {t('common.arrived')} <span className="font-semibold text-slate-200">{s.intake_date}</span>
                                {s.size && ` • ${t('tech.batch.size').replace('{s}', s.size)}`}
                              </p>
                              <div className="mt-2 flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('mgr.dashboard.assign_to')}</span>
                                {assignedIds.length > 0 ? (
                                  <span className="text-xs font-semibold text-slate-300 bg-slate-850 px-2 py-0.5 rounded-lg border border-slate-800">
                                    {assignedNames}
                                  </span>
                                ) : (
                                  <span className="text-xs italic text-slate-500">
                                    {t('tech.dashboard.unassigned')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setAssigningShipment(s)
                                setSelectedTechs(assignedIds)
                              }}
                              className="self-start sm:self-center px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-955 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-sans"
                            >
                              <UserPlus className="w-4 h-4 text-slate-955" />
                              <span>{t('mgr.dashboard.assign_mission')}</span>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* IN INCUBATION TAB (MANAGER VIEW) */}
          {activeTab === 'in_incubation' && (() => {
            const filteredShipments = shipments
              .filter(s => !isShipmentArchived(s))
              .filter(s => s.batches.some(b => getIncubationStatus(b, s.template_id).locked))

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

            return (
              <div className="space-y-6">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="flex items-center gap-1.5 text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors uppercase tracking-wider group cursor-pointer w-fit mb-2 focus:outline-none"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span>{t('common.back_to_dashboard')}</span>
                </button>

                <h2 className="text-xl font-bold text-white mb-2">{t('incubation.title')}</h2>
                
                {filteredShipments.length === 0 ? (
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
                          className="bg-slate-900 border border-slate-800 hover:border-slate-750 rounded-3xl overflow-hidden transition-all duration-250 shadow-xl"
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
                                        className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-bold text-white">
                                              {t('mgr.archive.batch_label').replace('{n}', batch.number || t('common.unnamed_batch'))}
                                            </span>
                                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-950 text-red-400 border border-red-500/20 flex items-center gap-1">
                                              <Lock className="w-2.5 h-2.5" />
                                              {t('status.in_incubation')}
                                            </span>
                                          </div>
                                          <p className="text-[10px] text-slate-400 mt-1">
                                            {t('tech.batch.prod')} {batch.production_date || '-'} • {t('tech.batch.exp')} {batch.expiration_date || '-'}
                                          </p>

                                          {/* Incubator Cycles Breakdown */}
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-800/40">
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

                                        {/* Action Button for Manager */}
                                        <div className="flex items-center shrink-0 w-full md:w-auto mt-2 md:mt-0">
                                          <button
                                            onClick={() => toggleIncubationUnlock(batch.id, batch.is_manually_unlocked)}
                                            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer w-full md:w-auto shadow-md hover:shadow-amber-500/10"
                                          >
                                            <Unlock className="w-4 h-4 text-slate-950" />
                                            <span>{t('mgr.overview.unlock')}</span>
                                          </button>
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
                )}
              </div>
            )
          })()}

          {/* SHIPMENT INTAKE */}
          {activeTab === 'intake' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">{t('mgr.intake.title')}</h2>
                <button
                  onClick={() => setShipmentModal('new')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('mgr.intake.log_btn')}</span>
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
                            <span className="text-[10px] text-slate-500 font-bold shrink-0">
                              ({t('tech.batch.batches_count').replace('{n}', s.batches.length)})
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {t('mgr.intake.supplier')} <span className="font-semibold text-slate-350">{s.supplier}</span> • 
                            {t('mgr.intake.arrived')} <span className="font-semibold text-slate-355">{s.intake_date}</span>
                            {s.size && ` • ${t('mgr.intake.size').replace('{s}', s.size)}`}
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
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t('mgr.intake.batches_section')}</p>
                          <div className="grid grid-cols-1 gap-2">
                            {s.batches.map(b => {
                              const bStatus = getIncubationStatus(b, s.template_id)
                              return (
                                <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900 border border-slate-800/80 p-2.5 rounded-xl">
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-xs font-bold text-white">{b.number || t('mgr.intake.unnamed')}</span>
                                    {b.approved_at && <span className="text-emerald-400 text-[10px] font-semibold">{t('mgr.intake.approved')}</span>}
                                    {bStatus.required && (
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        bStatus.locked 
                                          ? 'bg-red-950 text-red-400 border border-red-500/20' 
                                          : bStatus.due 
                                          ? 'bg-amber-950 text-amber-400 border border-amber-500/20 animate-pulse'
                                          : 'bg-teal-950 text-teal-400 border border-teal-500/20'
                                      }`}>
                                        {bStatus.locked ? (
                                          bStatus.daysRemaining === 0 ? t('mgr.intake.exits_today') :
                                          bStatus.daysRemaining === 1 ? t('mgr.intake.exits_tomorrow') :
                                          t('mgr.intake.exits_in').replace('{n}', bStatus.daysRemaining)
                                        ) : bStatus.due ? t('mgr.intake.ready') : bStatus.label}
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
                                        <span>{b.is_manually_unlocked ? t('mgr.intake.relock') : t('mgr.intake.unlock')}</span>
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

          {/* PRODUCT TEMPLATES */}
          {activeTab === 'templates' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">{t('mgr.templates.title')}</h2>
                <button
                  onClick={() => setTemplateModal('new')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('mgr.templates.create')}</span>
                </button>
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
                          placeholder={t('mgr.templates.search')}
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
                          { id: 'all', label: t('mgr.templates.filter.all') },
                          { id: 'incubation', label: t('mgr.templates.filter.incubation') },
                          { id: 'bypass', label: t('mgr.templates.filter.bypass') }
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
                        {t('mgr.templates.empty')}
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
                                <button
                                  onClick={() => setTemplateModal(template)}
                                  className="p-1.5 bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-white rounded-xl transition-all"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">{template.packaging || t('mgr.templates.no_packaging')}</p>
                              
                              <div className="mt-4 space-y-2">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('mgr.templates.incubation_cycles')}</p>
                                <div className="flex gap-4 text-xs text-slate-300">
                                  {template.requires_incubation !== false ? (
                                    <>
                                      <span>36°C: <strong>{t('mgr.templates.days').replace('{n}', template.incubation_36)}</strong></span>
                                      <span>55°C: <strong>{t('mgr.templates.days').replace('{n}', template.incubation_55)}</strong></span>
                                    </>
                                  ) : (
                                    <span className="text-slate-500 italic font-semibold">{t('mgr.templates.incubation_no')}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-6">
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">{t('mgr.templates.enabled_tests').replace('{n}', template.tests.length)}</p>
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

          {/* REVIEW & APPROVAL */}
          {activeTab === 'review' && (
            <div className="space-y-6">
              <button
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-1.5 text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors uppercase tracking-wider group cursor-pointer w-fit mb-2 focus:outline-none"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                <span>{t('common.back_to_dashboard')}</span>
              </button>

              <h2 className="text-xl font-bold text-white">{t('mgr.review.title')}</h2>

              {shipments.filter(s => !isShipmentArchived(s)).flatMap(s => s.batches.map(b => ({ ...b, shipment: s }))).length === 0 ? (
                <p className="text-sm text-slate-500 italic">{t('mgr.review.empty')}</p>
              ) : (
                <div className="space-y-6">
                  {shipments.filter(s => !isShipmentArchived(s)).map(s => {
                    const temp = getTemplate(s.template_id)
                    const activeBatches = s.batches
                    if (activeBatches.length === 0) return null

                    return (
                      <div key={s.id} className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
                        <div>
                          <h3 className="text-base font-bold text-teal-400">{temp?.name}</h3>
                          <p className="text-xs text-slate-500">{t('mgr.review.supplier')} {s.supplier} • {t('mgr.review.arrived')} {s.intake_date}</p>
                        </div>

                        <div className="space-y-4">
                          {activeBatches.map(batch => {
                            const isApproved = !!batch.approved_at
                            
                            // Check if all template tests are entered
                            const totalTests = temp?.tests || []
                            const enteredTests = totalTests.filter(tid => isTestEntered(tid, batch.id, results))
                            const isReady = enteredTests.length === totalTests.length

                            return (
                              <div
                                key={batch.id}
                                className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl space-y-4"
                              >
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                  <div>
                                    <span className="text-sm font-bold text-white">{batch.number || t('mgr.review.unnamed')}</span>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                      {t('mgr.review.prod')} {batch.production_date || '-'} {t('mgr.review.exp')} {batch.expiration_date || '-'}
                                    </p>
                                    {batch.retest_requested_at && (
                                      <div className="mt-1 text-[10px] text-amber-400 bg-amber-950/20 border border-amber-500/20 px-2 py-0.5 rounded-lg w-fit">
                                        {t('mgr.review.pending_retest').replace('{reason}', batch.retest_reason)}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3">
                                    {isApproved ? (
                                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-950 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full">
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        <span>{t('mgr.review.approved_badge')}</span>
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap items-center gap-2">
                                        {!isReady && (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-slate-800 text-amber-400 text-[10px] font-bold rounded-full">
                                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                                            <span>{t('mgr.review.in_progress')}</span>
                                          </span>
                                        )}
                                        <button
                                          onClick={() => approveBatch(batch.id)}
                                          className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                                        >
                                          {t('mgr.review.approve_btn')}
                                        </button>
                                        <button
                                          onClick={() => {
                                            setRetestInputBatchId(retestInputBatchId === batch.id ? null : batch.id)
                                            setRetestReason('')
                                          }}
                                          className="px-4 py-1.5 bg-red-900/60 hover:bg-red-900 border border-red-700/30 text-red-200 text-xs font-bold rounded-xl transition-all"
                                        >
                                          {t('mgr.review.decline_btn')}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {retestInputBatchId === batch.id && (
                                  <div className="mt-3 p-3 bg-slate-950/80 border border-slate-850 rounded-xl space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      {t('mgr.review.retest_label')}
                                    </label>
                                    <textarea
                                      value={retestReason}
                                      onChange={(e) => setRetestReason(e.target.value)}
                                      placeholder={t('mgr.review.retest_placeholder')}
                                      className="w-full h-20 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none resize-none"
                                    />
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setRetestInputBatchId(null)
                                          setRetestReason('')
                                        }}
                                        className="px-3 py-1 border border-slate-850 text-[10px] font-bold text-slate-400 hover:text-white rounded-lg transition-all"
                                      >
                                        {t('mgr.review.cancel')}
                                      </button>
                                      <button
                                        onClick={() => submitRetestRequest(batch.id)}
                                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg transition-all"
                                      >
                                        {t('mgr.review.submit')}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Results Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                  {(() => {
                                    const batchResults = {}
                                    totalTests.forEach(tid => {
                                      batchResults[tid] = results[`${batch.id}:${tid}`] || []
                                    })
                                    return totalTests.map(tid => {
                                      const test = getTestDefinition(tid, temp)
                                      if (!test) return null
                                      const repData = results[`${batch.id}:${tid}`] || []
                                      const calc = calculateTest(tid, repData, batchResults, test)
                                      const inStd = checkWithinStandard(temp, tid, calc)

                                      const std = temp?.standards?.[tid]
                                      const hasResults = !test.isCalculated ? repData.length > 0 : calc.complete

                                      return (
                                        <div
                                          key={tid}
                                          className={`p-3 border rounded-xl flex flex-col justify-between transition-all ${
                                            !hasResults
                                              ? 'bg-slate-950/10 border-slate-900 text-slate-600'
                                              : !inStd
                                              ? 'bg-red-950/20 border-red-500/35 text-red-200'
                                              : 'bg-slate-900 border-slate-800 text-slate-300'
                                          }`}
                                        >
                                          <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                                              {test.name}
                                            </p>
                                            <p className="text-xs font-extrabold mt-1.5">
                                              {hasResults ? calc.label : t('mgr.review.pending_result')}
                                            </p>
                                          </div>

                                          {hasResults && std && test.standardsType !== 'none' && (
                                            <div className="mt-2 text-[9px] font-semibold opacity-60 pt-1.5 border-t border-slate-800/40">
                                              {test.standardsType === 'min' && std.min !== null && std.min !== undefined && t('mgr.review.min_std').replace('{n}', std.min)}
                                              {test.standardsType === 'max' && std.max !== null && std.max !== undefined && t('mgr.review.max_std').replace('{n}', std.max)}
                                              {test.standardsType === 'range' && t('mgr.review.range_std').replace('{min}', std.min ?? '-').replace('{max}', std.max ?? '-')}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })
                                  })()}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* COA LIST & REPRINTS (FRESH & ARCHIVED) */}
          {(activeTab === 'archive' || activeTab === 'fresh_coas') && (() => {
            const timeWindowMs = 24 * 60 * 60 * 1000
            const now = Date.now()

            const filteredApprovedShipments = shipments.map(s => {
              const matchingBatches = (s.batches || []).filter(b => {
                // Must be approved
                if (!b.approved_at) return false

                // Age check
                const approvedTime = new Date(b.approved_at).getTime()
                const ageInMs = now - approvedTime
                const isFresh = ageInMs <= timeWindowMs

                if (activeTab === 'fresh_coas') {
                  if (!isFresh) return false
                } else {
                  // activeTab === 'archive'
                  if (isFresh) return false
                }

                // Search & Date filters
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
                <h2 className="text-xl font-bold text-white no-print">
                  {activeTab === 'fresh_coas' ? t('mgr.coa.title') : t('mgr.archive.title')}
                </h2>

                {/* Search & Filter Controls Panel */}
                <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 no-print shadow-lg">
                  <div className="flex flex-col md:flex-row gap-4 justify-between md:items-center">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      {activeTab === 'fresh_coas' ? t('mgr.coa.search_heading') : t('mgr.archive.search_heading')}
                    </h3>
                    {coaSelectedBatchId && (
                      <button
                        onClick={() => setCoaSelectedBatchId('')}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-bold text-teal-400 rounded-xl transition-all cursor-pointer"
                      >
                        {t('mgr.filter.back')}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Search box */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.filter.search_label')}</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={coaSearch}
                          onChange={(e) => setCoaSearch(e.target.value)}
                          placeholder={t('mgr.filter.search_placeholder')}
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.filter.date_label')}</label>
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
                        <option value="all">{t('mgr.filter.all_dates')}</option>
                        <option value="approved_at">{t('mgr.filter.approval_date')}</option>
                        <option value="intake_date">{t('mgr.filter.intake_date')}</option>
                        <option value="production_date">{t('mgr.filter.prod_date')}</option>
                      </select>
                    </div>

                    {/* Start Date */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.filter.from')}</label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.filter.to')}</label>
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
                        className="text-[10px] text-slate-455 hover:text-white font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        {t('mgr.filter.clear_btn')}
                      </button>
                    </div>
                  )}
                </div>

                {/* If batch is selected, show Print/Download controls for that batch, else show selection list */}
                {coaSelectedBatchId && (
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl flex justify-end gap-3 no-print">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-950 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>{t('mgr.coa.print_btn')}</span>
                    </button>
                    <button
                      onClick={() => {
                        try {
                          const batchObj = shipments.flatMap(s => s.batches).find(b => b.id === coaSelectedBatchId)
                          if (batchObj) {
                            downloadCoaPdf(batchObj.number)
                          } else {
                            alert(t('mgr.alert.batch_not_found').replace('{id}', coaSelectedBatchId))
                          }
                        } catch (err) {
                          alert(`${t('mgr.alert.download_error')} ${err.message}`)
                        }
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>{t('mgr.coa.download_btn')}</span>
                    </button>
                  </div>
                )}

                {coaSelectedBatchId ? (
                  <div className="w-full overflow-x-auto no-scrollbar pb-6 no-print">
                    <div id="coa-report-view" className="p-8 bg-white text-slate-900 border border-slate-300 rounded-3xl w-[700px] sm:w-auto max-w-3xl mx-auto shadow-xl flex flex-col justify-between min-h-[9.2in] shrink-0">
                    {/* COA Top Header */}
                    <div>
                      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
                        <div>
                          <h1 className="text-2xl font-black uppercase text-slate-955">{t('coa.title')}</h1>
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
                              <span className="text-[9px] font-bold text-slate-455 uppercase block">{t('coa.field.product')}</span>
                              <span className="font-extrabold text-slate-900">{temp?.name}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-455 uppercase block">{t('coa.field.batch')}</span>
                              <span className="font-extrabold text-slate-900">{batch?.number || t('coa.unnamed_batch')}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-455 uppercase block">{t('coa.field.supplier')}</span>
                              <span className="font-medium text-slate-900">{batch?.shipment?.supplier}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-455 uppercase block">{t('coa.field.prod_date')}</span>
                              <span className="font-medium text-slate-900">{batch?.production_date || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-455 uppercase block">{t('coa.field.exp_date')}</span>
                              <span className="font-medium text-slate-900">{batch?.expiration_date || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-455 uppercase block">{t('coa.field.intake_date')}</span>
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
                          <span className="text-[9px] font-bold text-slate-440 uppercase tracking-wider block">
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
                      {activeTab === 'fresh_coas' 
                        ? t('mgr.coa.empty_recent') 
                        : t('mgr.archive.empty')}
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
                                {t('mgr.archive.supplier')} <span className="font-semibold text-slate-200">{shipment.supplier}</span> • {t('mgr.archive.arrived')} <span className="font-semibold text-slate-200">{shipment.intake_date}</span>
                              </p>
                            </div>

                            <div className="space-y-3 border-t border-slate-800/60 pt-4">
                              <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">{t('mgr.archive.approved_count').replace('{n}', shipment.matchingBatches.length)}</p>

                              <div className="space-y-2">
                                {shipment.matchingBatches.map(b => {
                                  const formattedAppDate = b.approved_at ? new Date(b.approved_at).toLocaleDateString() : '-'
                                  return (
                                    <div
                                      key={b.id}
                                      className="p-3 bg-slate-950/40 border border-slate-850 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    >
                                      <div>
                                        <p className="text-xs font-bold text-teal-400">{t('mgr.archive.batch_label').replace('{n}', b.number || t('common.unnamed_batch'))}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                          {t('mgr.review.prod')} {b.production_date || '-'} • {t('mgr.review.approved_badge')}: {formattedAppDate}
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => setCoaSelectedBatchId(b.id)}
                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 text-[10px] font-bold rounded-lg active:scale-[0.98] transition-all cursor-pointer font-sans"
                                      >
                                        <FileText className="w-3.5 h-3.5 text-slate-955" />
                                        <span>{t('mgr.archive.generate_coa')}</span>
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
                  )
                )}
              </div>
            )
          })()}

          {/* USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white">{t('mgr.users.title')}</h2>

              {/* Register form */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-teal-400" />
                  <span>{t('mgr.users.provision_title')}</span>
                </h3>

                {userMsg.text && (
                  <div className={`p-4 rounded-xl text-xs font-semibold mb-4 border ${
                    userMsg.type === 'success' ? 'bg-teal-950/40 border-teal-500/20 text-teal-300' : 'bg-red-950/40 border-red-500/20 text-red-300'
                  }`}>
                    {userMsg.text}
                  </div>
                )}

                <form onSubmit={handleRegisterUser} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.users.name_label')}</label>
                    <input
                      type="text"
                      required
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder={t('mgr.users.name_placeholder')}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.users.email_label')}</label>
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder={t('mgr.users.email_placeholder')}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.users.password_label')}</label>
                    <input
                      type="password"
                      required
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder={t('mgr.users.password_placeholder')}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                  >
                    {t('mgr.users.create_btn')}
                  </button>
                </form>
              </div>

              {/* Profiles list */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                <h3 className="text-sm font-bold text-white mb-4">{t('mgr.users.existing_title')}</h3>
                
                <div className="divide-y divide-slate-800">
                  {usersList.map(u => (
                    <div key={u.id} className="py-3.5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-xs border-b border-slate-800 last:border-0">
                      <div>
                        <span className="font-bold text-slate-200">{u.name || t('mgr.users.no_name')}</span>
                        <span className="text-slate-400 block sm:inline sm:ml-2">{u.email}</span>
                        <span className="text-slate-650 block sm:inline sm:ml-2 hidden sm:inline">ID: {u.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          u.role === 'manager' ? 'bg-teal-950 text-teal-400' : 'bg-slate-950 text-slate-400'
                        }`}>
                          {u.role}
                        </span>
                        {u.id !== user.id && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setActiveUserMenuId(activeUserMenuId === u.id ? null : u.id)}
                              className="p-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-400 hover:text-white rounded-lg transition-all"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {activeUserMenuId === u.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setActiveUserMenuId(null)}
                                />
                                <div className={`absolute ${
                                  isRtl ? 'left-0' : 'right-0'
                                } mt-1 w-44 bg-slate-950 border border-slate-850 rounded-xl shadow-xl z-20 p-1.5 space-y-1`}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleUserRole(u.id, u.role)
                                      setActiveUserMenuId(null)
                                    }}
                                    className={`w-full px-3 py-2 text-[11px] font-bold rounded-lg transition-all hover:bg-slate-850 ${
                                      isRtl ? 'text-right' : 'text-left'
                                    }`}
                                  >
                                    {u.role === 'manager' ? t('mgr.users.set_technician') : t('mgr.users.set_manager')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDeleteUser(u.id, u.email)
                                      setActiveUserMenuId(null)
                                    }}
                                    className={`w-full px-3 py-2 text-[11px] font-bold rounded-lg text-red-400 transition-all hover:bg-red-950/20 ${
                                      isRtl ? 'text-right' : 'text-left'
                                    }`}
                                  >
                                    {t('mgr.users.delete')}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      {/* INTAKE LOG SHIPMENT MODAL */}
      {shipmentModal && (
        <ShipmentModal
          templates={templates}
          initialShipment={shipmentModal === 'new' ? null : shipmentModal}
          onSave={handleSaveShipment}
          onClose={() => setShipmentModal(null)}
          parseBatchNumber={parseBatchNumber}
        />
      )}

      {/* PRODUCT TEMPLATE BUILDER MODAL */}
      {templateModal && (
        <TemplateModal
          initialTemplate={templateModal === 'new' ? null : templateModal}
          onSave={handleSaveTemplate}
          onClose={() => setTemplateModal(null)}
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

      {/* MISSION ASSIGNMENT MODAL */}
      {assigningShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop overlay */}
          <div
            onClick={() => setAssigningShipment(null)}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          
          {/* Modal Panel */}
          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6 z-10">
            <div>
              <h3 className="text-lg font-bold text-white">
                {t('mgr.dashboard.assign_mission')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {getTemplate(assigningShipment.template_id)?.name || t('tech.batch.unknown_product')} • {assigningShipment.supplier}
              </p>
            </div>
            
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {t('mgr.dashboard.select_techs')}
              </h4>
              
              <div className="max-h-60 overflow-y-auto pr-1 space-y-2 scrollbar-none">
                {(() => {
                  const technicians = usersList.filter(u => u.role === 'technician')
                  
                  if (technicians.length === 0) {
                    return <p className="text-xs text-slate-500 italic p-3 text-center">{t('mgr.dashboard.no_techs')}</p>
                  }
                  
                  return technicians.map(tech => {
                    const isChecked = selectedTechs.includes(tech.id)
                    return (
                      <label
                        key={tech.id}
                        className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer select-none transition-all ${
                          isChecked
                            ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                            : 'bg-slate-950/40 border-slate-850 text-slate-450 hover:border-slate-800 hover:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedTechs(prev => prev.filter(id => id !== tech.id))
                            } else {
                              setSelectedTechs(prev => [...prev, tech.id])
                            }
                          }}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isChecked ? 'bg-teal-500 border-teal-400 text-slate-955' : 'border-slate-700 bg-slate-900'
                        }`}>
                          {isChecked && <CheckCircle className="w-3.5 h-3.5 text-white bg-teal-500 rounded-full" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{tech.name || tech.email}</p>
                          {tech.name && <p className="text-[9px] text-slate-500 truncate">{tech.email}</p>}
                        </div>
                      </label>
                    )
                  })
                })()}
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAssigningShipment(null)}
                className="flex-1 py-2.5 border border-slate-800 hover:border-slate-750 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveAssignment}
                className="flex-1 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-955 text-xs font-bold rounded-xl transition-all cursor-pointer font-sans"
              >
                {t('mgr.dashboard.save_assignment')}
              </button>
            </div>
          </div>
        </div>
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

// --- SUB-COMPONENTS (IN-FILE FOR SIMPLICITY & RELIABILITY) ---



function TemplateModal({ initialTemplate, onSave, onClose }) {
  const { t, isRtl } = useLanguage()
  const [selectedTests, setSelectedTests] = useState([])
  const [requiresIncubation, setRequiresIncubation] = useState(initialTemplate ? (initialTemplate.requires_incubation !== false) : true)
  const [incubation36, setIncubation36] = useState(initialTemplate?.incubation_36 || 0)
  const [incubation55, setIncubation55] = useState(initialTemplate?.incubation_55 || 0)

  // Custom Tests States
  const [customTests, setCustomTests] = useState([])
  const [newCustomName, setNewCustomName] = useState('')
  const [newCustomUnit, setNewCustomUnit] = useState('')
  const [newCustomIsRatio, setNewCustomIsRatio] = useState(false)
  const [newCustomNumeratorLabel, setNewCustomNumeratorLabel] = useState('')
  const [newCustomDenominatorLabel, setNewCustomDenominatorLabel] = useState('')
  const [newCustomValueLabel, setNewCustomValueLabel] = useState('')

  useEffect(() => {
    if (initialTemplate && initialTemplate.tests) {
      setSelectedTests(initialTemplate.tests)
    }
    if (initialTemplate) {
      setRequiresIncubation(initialTemplate.requires_incubation !== false)
      setIncubation36(initialTemplate.incubation_36 || 0)
      setIncubation55(initialTemplate.incubation_55 || 0)
      setCustomTests(initialTemplate.standards?._customTests || [])
    } else {
      setRequiresIncubation(true)
      setIncubation36(0)
      setIncubation55(0)
      setSelectedTests([])
      setCustomTests([])
    }
  }, [initialTemplate])

  const toggleTest = (testId) => {
    if (selectedTests.includes(testId)) {
      setSelectedTests(selectedTests.filter(id => id !== testId))
    } else {
      setSelectedTests([...selectedTests, testId])
    }
  }

  const handleAddCustomTest = () => {
    if (!newCustomName.trim()) return
    const newId = `custom_${Date.now()}`
    const newTest = {
      id: newId,
      name: newCustomName.trim(),
      unit: newCustomUnit.trim() || null,
      type: newCustomIsRatio ? 'ratio' : 'single',
      numeratorLabel: newCustomIsRatio ? (newCustomNumeratorLabel.trim() || null) : null,
      denominatorLabel: newCustomIsRatio ? (newCustomDenominatorLabel.trim() || null) : null,
      valueLabel: !newCustomIsRatio ? (newCustomValueLabel.trim() || null) : null,
      standardsType: 'range'
    }
    setCustomTests([...customTests, newTest])
    setSelectedTests([...selectedTests, newId])
    setNewCustomName('')
    setNewCustomUnit('')
    setNewCustomNumeratorLabel('')
    setNewCustomDenominatorLabel('')
    setNewCustomValueLabel('')
  }

  // Combine standard TESTS with customTests for rendering
  const allTestsList = [
    ...TESTS,
    ...customTests.map(ct => ({
      id: ct.id,
      name: ct.name,
      standardsType: 'range',
      unit: ct.unit || (ct.type === 'ratio' ? '%' : '')
    }))
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={onSave}
        className="bg-slate-900 border-0 sm:border border-slate-800 rounded-none sm:rounded-3xl w-full max-w-3xl h-full sm:h-auto sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Pass customTests to form submission via hidden input */}
        <input type="hidden" name="customTestsJson" value={JSON.stringify(customTests)} />

        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-white">{initialTemplate ? t('mgr.template_modal.title_edit') : t('mgr.template_modal.title_new')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.template_modal.product_name')}</label>
              <input
                type="text"
                name="name"
                required
                defaultValue={initialTemplate?.name || ''}
                placeholder={t('mgr.template_modal.product_placeholder')}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.template_modal.description_label')}</label>
              <input
                type="text"
                name="packaging"
                defaultValue={initialTemplate?.packaging || ''}
                placeholder={t('mgr.template_modal.description_placeholder')}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            
            {/* Toggle Switch Component instead of native checkbox */}
            <div className="space-y-1 col-span-1 sm:col-span-2 flex items-center py-2">
              <label htmlFor="requires_incubation" className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="requires_incubation"
                  id="requires_incubation"
                  checked={requiresIncubation}
                  onChange={(e) => setRequiresIncubation(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-850 border border-slate-800 rounded-full relative transition-all duration-200 peer peer-checked:bg-teal-500/20 peer-checked:border-teal-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-slate-400 peer-checked:after:bg-teal-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                <span className="ml-3 text-xs font-bold text-slate-400">
                  {t('mgr.template_modal.incubation_toggle')}
                </span>
              </label>
            </div>

            {requiresIncubation && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.template_modal.incubation_36')}</label>
                  <input
                    type="number"
                    name="incubation_36"
                    min="0"
                    value={incubation36}
                    onChange={(e) => setIncubation36(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.template_modal.incubation_55')}</label>
                  <input
                    type="number"
                    name="incubation_55"
                    min="0"
                    value={incubation55}
                    onChange={(e) => setIncubation55(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/50 pb-4 ${isRtl ? 'md:flex-row-reverse' : ''}`}>
              <h3 className="text-xs font-bold text-slate-350 uppercase tracking-widest">{t('mgr.template_modal.tests_heading')}</h3>
              
              {/* Dynamic Creator form for custom tests */}
              <div className={`p-4 bg-slate-950/40 border border-slate-800 rounded-2xl flex flex-col gap-3 w-full md:w-auto md:min-w-[450px] ${isRtl ? 'text-right' : 'text-left'}`}>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {t('mgr.template_modal.custom_label') || 'Create Custom Test'}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder={t('mgr.template_modal.custom_test_placeholder')}
                    value={newCustomName}
                    onChange={(e) => setNewCustomName(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none w-full"
                  />
                  <input
                    type="text"
                    placeholder={t('mgr.template_modal.custom_unit_placeholder')}
                    value={newCustomUnit}
                    onChange={(e) => setNewCustomUnit(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none w-full"
                  />
                </div>

                <div className="flex items-center gap-4 py-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">{t('mgr.template_modal.custom_single')}</span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newCustomIsRatio}
                      onChange={(e) => setNewCustomIsRatio(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-slate-850 border border-slate-700 rounded-full relative transition-all duration-200 peer peer-checked:bg-teal-500/20 peer-checked:border-teal-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-slate-400 peer-checked:after:bg-teal-400 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5"></div>
                  </label>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">{t('mgr.template_modal.custom_ratio')}</span>
                </div>

                {newCustomIsRatio ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder={t('mgr.template_modal.numerator_label_placeholder')}
                      value={newCustomNumeratorLabel}
                      onChange={(e) => setNewCustomNumeratorLabel(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none w-full"
                    />
                    <input
                      type="text"
                      placeholder={t('mgr.template_modal.denominator_label_placeholder')}
                      value={newCustomDenominatorLabel}
                      onChange={(e) => setNewCustomDenominatorLabel(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none w-full"
                    />
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      placeholder={t('mgr.template_modal.value_label_placeholder')}
                      value={newCustomValueLabel}
                      onChange={(e) => setNewCustomValueLabel(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none w-full"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAddCustomTest}
                  className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer self-end"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('mgr.template_modal.add_custom_btn')}</span>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {allTestsList.map(test => {
                const isChecked = selectedTests.includes(test.id)
                const std = initialTemplate?.standards?.[test.id] || {}
                const isCustom = test.id.startsWith('custom_')

                return (
                  <div
                    key={test.id}
                    className={`p-4 border rounded-2xl flex flex-col justify-between transition-all duration-200 ${
                      isChecked
                        ? 'bg-slate-950/40 border-teal-500/35 text-white'
                        : 'bg-slate-950/10 border-slate-850 text-slate-500'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full gap-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          name="tests"
                          value={test.id}
                          checked={isChecked}
                          onChange={() => toggleTest(test.id)}
                          className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-teal-600 focus:ring-teal-500/50"
                        />
                        <span className="text-xs font-bold">
                          {test.name}
                          {isCustom && (
                            <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 font-extrabold uppercase scale-90">
                              {test.unit === '%' ? 'Ratio' : 'Single'}
                            </span>
                          )}
                        </span>
                      </label>
                      
                      {isCustom && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomTests(customTests.filter(ct => ct.id !== test.id))
                            setSelectedTests(selectedTests.filter(tid => tid !== test.id))
                          }}
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-slate-800/40 rounded transition-all cursor-pointer shrink-0"
                          title="Delete custom test"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {isChecked && test.standardsType !== 'none' && (
                      <div className="mt-3 grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/40">
                        {(test.standardsType === 'min' || test.standardsType === 'range') ? (
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-slate-450 uppercase block">
                              {test.unit ? t('mgr.template_modal.min_threshold').replace('{unit}', test.unit) : 'Min'}
                            </label>
                            <input
                              type="number"
                              step="any"
                              name={`min:${test.id}`}
                              defaultValue={std.min ?? ''}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-white text-[10px] focus:outline-none"
                            />
                          </div>
                        ) : (
                          <input type="hidden" name={`min:${test.id}`} value="" />
                        )}

                        {(test.standardsType === 'max' || test.standardsType === 'range') ? (
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-slate-450 uppercase block">
                              {test.unit ? t('mgr.template_modal.max_threshold').replace('{unit}', test.unit) : 'Max'}
                            </label>
                            <input
                              type="number"
                              step="any"
                              name={`max:${test.id}`}
                              defaultValue={std.max ?? ''}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-white text-[10px] focus:outline-none"
                            />
                          </div>
                        ) : (
                          <input type="hidden" name={`max:${test.id}`} value="" />
                        )}
                      </div>
                    )}

                    {/* Empty placeholder fields if not checked to let FormData capture empty strings */}
                    {(!isChecked || test.standardsType === 'none') && (
                      <>
                        <input type="hidden" name={`min:${test.id}`} value="" />
                        <input type="hidden" name={`max:${test.id}`} value="" />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/95 backdrop-blur-md sticky bottom-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all"
          >
            {t('mgr.template_modal.cancel')}
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
          >
            {t('mgr.template_modal.save')}
          </button>
        </div>
      </form>
    </div>
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
      showToast(t('mgr.toast.account_updated'), 'success')
      onClose()
    } catch (err) {
      alert(`${t('mgr.alert.account_update_error')} ${err.message}`)
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
          <h2 className="text-lg font-bold text-white">{t('mgr.settings.title')}</h2>
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
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.settings.email')}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('mgr.settings.password')}</label>
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
            {t('mgr.settings.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-teal-500 hover:bg-teal-400 disabled:bg-teal-500/50 text-slate-950 text-xs font-bold rounded-xl transition-all"
          >
            {loading ? t('mgr.settings.saving') : t('mgr.settings.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
