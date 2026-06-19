import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { TESTS, testMap, calculateTest, fmt, isTestEntered } from '../utils/calculations'
import { parseBatchNumber } from '../utils/batchParser'
import {
  LogOut,
  LayoutDashboard,
  Calendar,
  FileSpreadsheet,
  Settings,
  Users,
  Printer,
  Download,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Edit,
  UserPlus
} from 'lucide-react'
// html2pdf imported dynamically inside downloadCoaPdf to avoid bundler issues

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
  const [activeTab, setActiveTab] = useState('dashboard') // 'dashboard' | 'intake' | 'templates' | 'review' | 'coa' | 'users'

  // Global State
  const [shipments, setShipments] = useState([])
  const [templates, setTemplates] = useState([])
  const [results, setResults] = useState({}) // batchId:testId -> replicates list
  const [usersList, setUsersList] = useState([])
  const [loading, setLoading] = useState(true)

  // Forms & Modal State
  const [shipmentModal, setShipmentModal] = useState(null) // { id, template_id, ... } or 'new'
  const [templateModal, setTemplateModal] = useState(null) // { id, name, ... } or 'new'
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [userMsg, setUserMsg] = useState({ type: '', text: '' })

  // COA print select
  const [coaSelectedBatchId, setCoaSelectedBatchId] = useState('')

  // Retest & Settings modal state
  const [retestInputBatchId, setRetestInputBatchId] = useState(null)
  const [retestReason, setRetestReason] = useState('')
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type })
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }))
    }, 3000)
  }

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
      setUserMsg({ type: 'success', text: `Technician ${newUserName || newUserEmail} registered successfully!` })
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
      showToast(`Role for ${userObj?.email || 'user'} changed to ${nextRole === 'manager' ? 'Manager' : 'Technician'}`)
    } catch (err) {
      alert(`Error updating user role: ${err.message}`)
    }
  }

  const handleDeleteUser = async (userId, userEmail) => {
    const confirmed = window.confirm(
      `WARNING: Are you sure you want to permanently delete user "${userEmail}"?\n\nThis will remove all their auth records, login access, and profile information. This action is PERMANENT and cannot be undone.`
    )
    if (!confirmed) return

    try {
      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: userId
      })
      if (error) throw error

      setUsersList(prev => prev.filter(u => u.id !== userId))
      showToast(`User ${userEmail} permanently deleted`)
    } catch (err) {
      alert(`Error deleting user: ${err.message}`)
    }
  }

  // Shipment Actions
  const handleSaveShipment = async (e) => {
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form))
    const isNew = shipmentModal === 'new'
    
    // Auto incubation exit date calculation
    const template = templates.find(t => t.id === data.template_id)
    const intakeDate = data.intake_date
    const u36 = Number(data.units_36 || 0)
    const u55 = Number(data.units_55 || 0)

    const addDays = (dateStr, days) => {
      const next = new Date(dateStr + 'T00:00:00')
      next.setDate(next.getDate() + Number(days))
      return next.toISOString().slice(0, 10)
    }

    const exit36 = u36 && template?.incubation_36 ? addDays(intakeDate, template.incubation_36) : null
    const exit55 = u55 && template?.incubation_55 ? addDays(intakeDate, template.incubation_55) : null

    try {
      let shipmentId = isNew ? null : shipmentModal.id

      // 1. Save shipment details
      const payload = {
        template_id: data.template_id,
        supplier: data.supplier,
        intake_date: intakeDate,
        size: data.size || null,
        units_36: u36,
        units_55: u55,
        exit_36: exit36,
        exit_55: exit55,
        is_manually_unlocked: isNew ? false : shipmentModal.is_manually_unlocked
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

        return {
          id: row.dataset.id || uuidv4(),
          shipment_id: shipmentId,
          number: numInput ? numInput.trim() : null,
          production_date: prodDate,
          expiration_date: expDate
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
      if (batchesError) throw error

      setShipmentModal(null)
      fetchData()
    } catch (err) {
      alert(`Error saving shipment: ${err.message}`)
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
      alert(`Error saving template: ${err.message}`)
    }
  }

  // Toggle incubation manually (Override Lock)
  const toggleIncubationUnlock = async (shipmentId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('shipments')
        .update({ is_manually_unlocked: !currentStatus })
        .eq('id', shipmentId)
      if (error) throw error
      fetchData()
    } catch (err) {
      alert(`Error toggling override: ${err.message}`)
    }
  }

  // Approve Batch Flow
  const approveBatch = async (batchId) => {
    const batchObj = shipments.flatMap(s => s.batches).find(b => b.id === batchId)
    if (!batchObj?.production_date) {
      alert('Cannot approve COA: Production date is missing. Please edit the shipment and set the production date first.')
      return
    }

    // Check if all template tests are entered
    const shipmentObj = shipments.find(s => s.batches.some(b => b.id === batchId))
    const template = shipmentObj ? templates.find(t => t.id === shipmentObj.template_id) : null
    const totalTests = template?.tests || []
    const enteredTests = totalTests.filter(tid => isTestEntered(tid, batchId, results))
    const isReady = enteredTests.length === totalTests.length

    if (!isReady) {
      const confirmProceed = window.confirm('There are tests that have not been performed yet. Are you sure you want to approve this batch anyway?')
      if (!confirmProceed) return
    }

    try {
      const { error } = await supabase
        .from('batches')
        .update({ approved_at: new Date().toISOString() })
        .eq('id', batchId)
      if (error) throw error
      fetchData()
    } catch (err) {
      alert(`Error approving batch: ${err.message}`)
    }
  }

  // Submit Retest Request
  const submitRetestRequest = async (batchId) => {
    if (!retestReason.trim()) {
      alert('Please enter a reason for the retest request.')
      return
    }

    // Check if all template tests are entered
    const shipmentObj = shipments.find(s => s.batches.some(b => b.id === batchId))
    const template = shipmentObj ? templates.find(t => t.id === shipmentObj.template_id) : null
    const totalTests = template?.tests || []
    const enteredTests = totalTests.filter(tid => isTestEntered(tid, batchId, results))
    const isReady = enteredTests.length === totalTests.length

    if (!isReady) {
      const confirmProceed = window.confirm('There are tests that have not been performed yet. Are you sure you want to request a retest for this batch anyway?')
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
      showToast('Retest request submitted successfully.', 'success')
    } catch (err) {
      alert(`Error submitting retest request: ${err.message}`)
    }
  }

  // Generate PDF client-side
  const downloadCoaPdf = async (batchNumber) => {
    const element = document.getElementById('coa-report-view')
    if (!element) return

    const opt = {
      margin: 0.5,
      filename: `COA_Batch_${batchNumber || 'Unnamed'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }

    try {
      // Dynamically import the minified, bundle-safe build of html2pdf
      const html2pdfModule = await import('html2pdf.js/dist/html2pdf.min.js')
      const html2pdf = html2pdfModule.default || html2pdfModule
      html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('Failed to download PDF:', err)
      alert(`Error generating PDF: ${err.message}`)
    }
  }

  // --- RENDER HEPLERS ---
  const getTemplate = (id) => templates.find(t => t.id === id)

  const getIncubationStatus = (shipment) => {
    const template = getTemplate(shipment.template_id)
    if (!template) return { required: false, locked: false, label: 'Ready' }

    if (template.requires_incubation === false) {
      return { required: false, locked: false, label: 'Ready' }
    }

    const needs36 = (shipment.units_36 || 0) > 0 && (template.incubation_36 || 0) > 0
    const needs55 = (shipment.units_55 || 0) > 0 && (template.incubation_55 || 0) > 0
    const required = needs36 || needs55

    if (shipment.is_manually_unlocked) {
      return { required, locked: false, label: 'Unlocked Override' }
    }

    const exited = !!(shipment.incubation_exited_at || shipment.incubation_removed_early_at)
    const today = new Date().toISOString().slice(0, 10)
    const due36 = needs36 ? (shipment.exit_36 && shipment.exit_36 <= today) : false
    const due55 = needs55 ? (shipment.exit_55 && shipment.exit_55 <= today) : false
    const due = required && !exited && (due36 || due55)

    const locked = required && !exited && !due

    let label = 'Ready'
    if (required) {
      if (exited) label = 'Exited Incubation'
      else if (due) label = 'Incubation Due'
      else label = 'In Incubation'
    }

    return { required, locked, due, exited, label }
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

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 px-6 py-4 flex justify-between items-center no-print">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-xl text-teal-400">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Manager Administration Portal</h1>
            <span className="text-[10px] uppercase tracking-wider text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full font-bold">
              Full Master Control
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-400">Signed in as</p>
            <p className="text-sm font-semibold text-slate-200">{profile?.name || user?.email}</p>
          </div>
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="p-2.5 bg-slate-800 hover:bg-teal-950/40 border border-slate-700 hover:border-teal-500/30 text-slate-300 hover:text-teal-400 rounded-xl transition-all duration-200"
            title="Account Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={logout}
            className="p-2.5 bg-slate-800 hover:bg-red-950/40 border border-slate-700 hover:border-red-500/30 text-slate-300 hover:text-red-400 rounded-xl transition-all duration-200"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 mt-8 flex flex-col lg:flex-row gap-8">
        {/* Left Sidebar Navigation */}
        <nav className="w-full lg:w-64 shrink-0 flex flex-col gap-2 p-3 bg-slate-900 border border-slate-800 rounded-3xl h-fit no-print">
          {[
            { id: 'dashboard', label: 'Overview Metrics', icon: LayoutDashboard },
            { id: 'intake', label: 'Shipment Intake', icon: Calendar },
            { id: 'templates', label: 'Product Templates', icon: Settings },
            { id: 'review', label: 'Review & Approval', icon: CheckCircle },
            { id: 'coa', label: 'COA Certificate', icon: Printer },
            { id: 'users', label: 'User Accounts', icon: Users }
          ].map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  // Seed selected batch if clicking COA and none selected
                  if (tab.id === 'coa' && !coaSelectedBatchId) {
                    const approved = shipments.flatMap(s => s.batches).find(b => b.approved_at)
                    if (approved) setCoaSelectedBatchId(approved.id)
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-left transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-slate-950 shadow-lg shadow-teal-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Right Content Panels */}
        <div className="flex-1 min-w-0">
          {/* OVERVIEW METRICS */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white mb-2">Metrics Summary</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="p-6 bg-slate-900 border border-slate-800 border-l-4 border-l-teal-500 rounded-3xl">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Templates Configured</p>
                  <p className="text-4xl font-extrabold text-white mt-2">{templates.length}</p>
                </div>
                <div className="p-6 bg-slate-900 border border-slate-800 border-l-4 border-l-amber-500 rounded-3xl">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Awaiting Testing</p>
                  <p className="text-4xl font-extrabold text-white mt-2">
                    {shipments.flatMap(s => s.batches).filter(b => !b.approved_at).length}
                  </p>
                </div>
                <div className="p-6 bg-slate-900 border border-slate-800 border-l-4 border-l-emerald-500 rounded-3xl">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Approved Batches (COAs)</p>
                  <p className="text-4xl font-extrabold text-white mt-2">
                    {shipments.flatMap(s => s.batches).filter(b => b.approved_at).length}
                  </p>
                </div>
              </div>

              {/* Incubation warnings */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                <h3 className="text-sm font-bold text-white mb-4">Incubation Actions Required</h3>
                
                {shipments.filter(s => getIncubationStatus(s).due).length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No shipments need manual exit validation.</p>
                ) : (
                  <div className="space-y-4">
                    {shipments
                      .filter(s => getIncubationStatus(s).due)
                      .map(s => {
                        const temp = getTemplate(s.template_id)
                        return (
                          <div
                            key={s.id}
                            className="p-4 bg-amber-950/20 border border-amber-500/20 rounded-2xl flex justify-between items-center gap-4"
                          >
                            <div>
                              <p className="text-sm font-bold text-amber-400">{temp?.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">Supplier: {s.supplier} • Arrived: {s.intake_date}</p>
                            </div>
                            <button
                              onClick={() => toggleIncubationUnlock(s.id, s.is_manually_unlocked)}
                              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                            >
                              Unlock Testing
                            </button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SHIPMENT INTAKE */}
          {activeTab === 'intake' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Intake Log</h2>
                <button
                  onClick={() => setShipmentModal('new')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Log Shipment</span>
                </button>
              </div>

              <div className="space-y-4">
                {shipments.map(s => {
                  const temp = getTemplate(s.template_id)
                  const incStatus = getIncubationStatus(s)
                  return (
                    <div
                      key={s.id}
                      className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-slate-750 transition-all"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-bold text-white">{temp?.name}</h3>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            incStatus.locked ? 'bg-red-950 text-red-400 border border-red-500/20' : 'bg-teal-950 text-teal-400 border border-teal-500/20'
                          }`}>
                            {incStatus.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Supplier: <span className="font-semibold text-slate-200">{s.supplier}</span> • 
                          Arrived: <span className="font-semibold text-slate-200">{s.intake_date}</span>
                          {s.size && ` • Size: ${s.size}`}
                        </p>
                        {/* Batches count info */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {s.batches.map(b => (
                            <span key={b.id} className="px-2.5 py-0.5 bg-slate-950 text-slate-400 border border-slate-850 rounded text-[10px] font-semibold">
                              {b.number || 'Unnamed Batch'} {b.approved_at && '✓'}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {incStatus.required && !incStatus.exited && (
                          <button
                            onClick={() => toggleIncubationUnlock(s.id, s.is_manually_unlocked)}
                            className={`flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                              s.is_manually_unlocked
                                ? 'bg-amber-950/20 border-amber-500/30 text-amber-400 hover:bg-amber-900/10'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            {s.is_manually_unlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            <span>{s.is_manually_unlocked ? 'Re-lock' : 'Unlock Testing'}</span>
                          </button>
                        )}

                        <button
                          onClick={() => setShipmentModal(s)}
                          className="p-2 bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-white rounded-xl transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
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
                <h2 className="text-xl font-bold text-white">Templates Configuration</h2>
                <button
                  onClick={() => setTemplateModal('new')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Template</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {templates.map(t => (
                  <div
                    key={t.id}
                    className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col justify-between hover:border-slate-750 transition-all"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-4">
                        <h3 className="text-base font-bold text-white">{t.name}</h3>
                        <button
                          onClick={() => setTemplateModal(t)}
                          className="p-1.5 bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-white rounded-xl transition-all"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{t.packaging || 'No standard packaging'}</p>
                      
                      <div className="mt-4 space-y-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Incubation Cycles</p>
                        <div className="flex gap-4 text-xs text-slate-300">
                          {t.requires_incubation !== false ? (
                            <>
                              <span>36°C: <strong>{t.incubation_36} days</strong></span>
                              <span>55°C: <strong>{t.incubation_55} days</strong></span>
                            </>
                          ) : (
                            <span className="text-slate-500 italic font-semibold">Requires Incubation: No</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Enabled Tests ({t.tests.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.tests.map(tid => {
                          const test = testMap[tid]
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
            </div>
          )}

          {/* REVIEW & APPROVAL */}
          {activeTab === 'review' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white">Review Dashboard</h2>

              {shipments.flatMap(s => s.batches.map(b => ({ ...b, shipment: s }))).length === 0 ? (
                <p className="text-sm text-slate-500 italic">No batches recorded in the intake log.</p>
              ) : (
                <div className="space-y-6">
                  {shipments.map(s => {
                    const temp = getTemplate(s.template_id)
                    const activeBatches = s.batches
                    if (activeBatches.length === 0) return null

                    return (
                      <div key={s.id} className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
                        <div>
                          <h3 className="text-base font-bold text-teal-400">{temp?.name}</h3>
                          <p className="text-xs text-slate-500">Supplier: {s.supplier} • Arrived: {s.intake_date}</p>
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
                                    <span className="text-sm font-bold text-white">{batch.number || 'Unnamed Batch'}</span>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                      Prod: {batch.production_date || '-'} • Exp: {batch.expiration_date || '-'}
                                    </p>
                                    {batch.retest_requested_at && (
                                      <div className="mt-1 text-[10px] text-amber-400 bg-amber-950/20 border border-amber-500/20 px-2 py-0.5 rounded-lg w-fit">
                                        Pending Retest: {batch.retest_reason}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3">
                                    {isApproved ? (
                                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-950 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full">
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        <span>Approved</span>
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap items-center gap-2">
                                        {!isReady && (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-slate-800 text-amber-400 text-[10px] font-bold rounded-full">
                                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                                            <span>Testing in progress</span>
                                          </span>
                                        )}
                                        <button
                                          onClick={() => approveBatch(batch.id)}
                                          className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                                        >
                                          Approve & Sign COA
                                        </button>
                                        <button
                                          onClick={() => {
                                            setRetestInputBatchId(retestInputBatchId === batch.id ? null : batch.id)
                                            setRetestReason('')
                                          }}
                                          className="px-4 py-1.5 bg-red-900/60 hover:bg-red-900 border border-red-700/30 text-red-200 text-xs font-bold rounded-xl transition-all"
                                        >
                                          Decline & Request Retest
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {retestInputBatchId === batch.id && (
                                  <div className="mt-3 p-3 bg-slate-950/80 border border-slate-850 rounded-xl space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Reason for Retest Request
                                    </label>
                                    <textarea
                                      value={retestReason}
                                      onChange={(e) => setRetestReason(e.target.value)}
                                      placeholder="Explain why a retest is requested..."
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
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => submitRetestRequest(batch.id)}
                                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg transition-all"
                                      >
                                        Submit Request
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
                                      const test = testMap[tid]
                                      if (!test) return null
                                      const repData = results[`${batch.id}:${tid}`] || []
                                      const calc = calculateTest(tid, repData, batchResults)
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
                                              {hasResults ? calc.label : 'Pending'}
                                            </p>
                                          </div>

                                          {hasResults && std && test.standardsType !== 'none' && (
                                            <div className="mt-2 text-[9px] font-semibold opacity-60 pt-1.5 border-t border-slate-800/40">
                                              {test.standardsType === 'min' && std.min !== null && std.min !== undefined && `Min Standard: ${std.min}`}
                                              {test.standardsType === 'max' && std.max !== null && std.max !== undefined && `Max Standard: ${std.max}`}
                                              {test.standardsType === 'range' && `Standard Range: ${std.min ?? '-'} to ${std.max ?? '-'}`}
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

          {/* COA PRINT / SAVE */}
          {activeTab === 'coa' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white no-print">Certificate of Analysis Generation</h2>

              {/* COA selector row */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <span className="text-xs text-slate-400 font-bold uppercase shrink-0">Select Approved Batch:</span>
                  <select
                    value={coaSelectedBatchId}
                    onChange={(e) => setCoaSelectedBatchId(e.target.value)}
                    className="flex-1 sm:w-64 px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                  >
                    <option value="">-- Select Batch --</option>
                    {shipments
                      .flatMap(s => s.batches.map(b => ({ ...b, shipment: s })))
                      .filter(b => b.approved_at)
                      .map(b => {
                        const temp = getTemplate(b.shipment.template_id)
                        return (
                          <option key={b.id} value={b.id}>
                            {b.number || 'Unnamed Batch'} - {temp?.name}
                          </option>
                        )
                      })}
                  </select>
                </div>

                {coaSelectedBatchId && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-950 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print Document</span>
                    </button>
                    <button
                      onClick={() => {
                        const batchObj = shipments.flatMap(s => s.batches).find(b => b.id === coaSelectedBatchId)
                        if (batchObj) downloadCoaPdf(batchObj.number)
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Printable report page view */}
              {coaSelectedBatchId ? (
                <div id="coa-report-view" className="p-8 bg-white text-slate-900 border border-slate-300 rounded-3xl max-w-3xl mx-auto shadow-xl flex flex-col justify-between min-h-[10.5in]">
                  {/* COA Top Header */}
                  <div>
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
                      <div>
                        <h1 className="text-2xl font-black uppercase text-slate-950">Certificate Of Analysis</h1>
                        <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">
                          Food Quality Control Laboratory
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="inline-block px-3 py-1 bg-slate-900 text-white text-[10px] font-bold uppercase rounded">
                          Approved COA
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-medium">
                          Release Date: {
                            new Date(shipments.flatMap(s => s.batches).find(b => b.id === coaSelectedBatchId)?.approved_at).toLocaleDateString()
                          }
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
                            <span className="text-[9px] font-bold text-slate-450 uppercase block">Product Name</span>
                            <span className="font-extrabold text-slate-900">{temp?.name}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-450 uppercase block">Batch Number</span>
                            <span className="font-extrabold text-slate-900">{batch?.number || 'Unnamed Batch'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-450 uppercase block">Supplier</span>
                            <span className="font-medium text-slate-900">{batch?.shipment?.supplier}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-450 uppercase block">Packaging Unit</span>
                            <span className="font-medium text-slate-900">{batch?.shipment?.size || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-450 uppercase block">Intake Date</span>
                            <span className="font-medium text-slate-900">{batch?.shipment?.intake_date}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-450 uppercase block">Production Date</span>
                            <span className="font-medium text-slate-900">{batch?.production_date || '-'}</span>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Results table */}
                    <div className="overflow-hidden border border-slate-200 rounded-2xl mb-8">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                            <th className="p-3">Analysis Param</th>
                            <th className="p-3 text-right">Result Value (Average)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const batch = shipments.flatMap(s => s.batches.map(b => ({ ...b, shipment: s }))).find(b => b.id === coaSelectedBatchId)
                            const temp = getTemplate(batch?.shipment?.template_id)
                            const batchResults = {}
                            if (batch && temp) {
                              temp.tests.forEach(tid => {
                                batchResults[tid] = results[`${batch.id}:${tid}`] || []
                              })
                            }
                            return temp?.tests.map(tid => {
                              const test = testMap[tid]
                              if (!test) return null
                              const repData = results[`${batch.id}:${tid}`] || []
                              const calc = calculateTest(tid, repData, batchResults)

                              return (
                                <tr key={tid} className="border-b border-slate-150 last:border-0 hover:bg-slate-50/50">
                                  <td className="p-3 font-semibold text-slate-800">{test.name}</td>
                                  <td className="p-3 text-right font-bold text-slate-950">{calc.label}</td>
                                </tr>
                              )
                            })
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* COA Bottom Signoff Footer */}
                  <div className="border-t border-slate-200 pt-6 mt-auto">
                    <div className="flex justify-between items-end">
                      <div className="text-[10px] text-slate-500 font-medium max-w-sm">
                        Disclaimer: The analysis results provided in this certificate correspond strictly to the samples tested at reception.
                      </div>
                      <div className="text-right">
                        <div className="w-36 border-b border-slate-400 mb-2 h-8" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                          Lab Manager Signature
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-3xl">
                  Please select an approved batch to display its Certificate of Analysis report.
                </div>
              )}
            </div>
          )}

          {/* USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white">User Administration</h2>

              {/* Register form */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-teal-400" />
                  <span>Provision Technician Account</span>
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="technician@company.com"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Default Password</label>
                    <input
                      type="password"
                      required
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                  >
                    Create Account
                  </button>
                </form>
              </div>

              {/* Profiles list */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                <h3 className="text-sm font-bold text-white mb-4">Existing Profiles</h3>
                
                <div className="divide-y divide-slate-800">
                  {usersList.map(u => (
                    <div key={u.id} className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-200">{u.name || 'No Name'}</span>
                        <span className="text-slate-400 ml-2">({u.email})</span>
                        <span className="text-slate-600 ml-2">ID: {u.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          u.role === 'manager' ? 'bg-teal-950 text-teal-400' : 'bg-slate-950 text-slate-400'
                        }`}>
                          {u.role}
                        </span>
                        {u.id !== user.id && (
                          <>
                            <button
                              onClick={() => toggleUserRole(u.id, u.role)}
                              className="px-2.5 py-1 bg-slate-850 hover:bg-slate-750 border border-slate-755 text-[10px] font-bold text-slate-300 hover:text-white rounded-lg transition-all"
                            >
                              Set as {u.role === 'manager' ? 'Technician' : 'Manager'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              className="px-2.5 py-1 bg-slate-950 hover:bg-red-950/40 border border-slate-800 hover:border-red-500/20 text-[10px] font-bold text-slate-400 hover:text-red-400 rounded-lg transition-all"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
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

      {/* Toast Notification */}
      {toast.visible && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-teal-950 border border-teal-500/35 text-teal-200 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
          <CheckCircle className="w-5 h-5 shrink-0 text-teal-400" />
          <span className="text-xs font-bold">{toast.message}</span>
        </div>
      )}
    </div>
  )
}

// --- SUB-COMPONENTS (IN-FILE FOR SIMPLICITY & RELIABILITY) ---

function ShipmentModal({ templates, initialShipment, onSave, onClose, parseBatchNumber }) {
  const [batches, setBatches] = useState([{ number: '', production_date: '', expiration_date: '' }])
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialShipment?.template_id || '')

  useEffect(() => {
    if (initialShipment) {
      if (initialShipment.batches) {
        setBatches(initialShipment.batches)
      }
      setSelectedTemplateId(initialShipment.template_id || '')
    } else {
      setSelectedTemplateId('')
      setBatches([{ number: '', production_date: '', expiration_date: '' }])
    }
  }, [initialShipment])

  const addBatchRow = () => {
    setBatches([...batches, { number: '', production_date: '', expiration_date: '' }])
  }

  const removeBatchRow = (idx) => {
    if (batches.length <= 1) return
    setBatches(batches.filter((_, i) => i !== idx))
  }

  const handleBatchValChange = (idx, field, value) => {
    const updated = [...batches]
    updated[idx] = {
      ...updated[idx],
      [field]: value
    }

    // Auto production date calculation if editing batch number
    if (field === 'number') {
      const parsed = parseBatchNumber(value)
      if (parsed.valid) {
        updated[idx].production_date = parsed.date
      }
    }

    setBatches(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={onSave}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-white">{initialShipment ? 'Edit Shipment' : 'Log New Shipment'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product</label>
              <select
                name="template_id"
                required
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              >
                <option value="">-- Select Product --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supplier</label>
              <input
                type="text"
                name="supplier"
                required
                defaultValue={initialShipment?.supplier || ''}
                placeholder="Supplier Name"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Intake Date</label>
              <input
                type="date"
                name="intake_date"
                required
                defaultValue={initialShipment?.intake_date || new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Packaging Size / Unit</label>
              <input
                type="text"
                name="size"
                defaultValue={initialShipment?.size || ''}
                placeholder="e.g. 140 g, 960 g, 1 L"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
          </div>

          {(() => {
            const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
            const requiresInc = selectedTemplate ? (selectedTemplate.requires_incubation !== false) : true
            const hasInc36 = requiresInc && selectedTemplate && (selectedTemplate.incubation_36 || 0) > 0
            const hasInc55 = requiresInc && selectedTemplate && (selectedTemplate.incubation_55 || 0) > 0

            if (!hasInc36 && !hasInc55) {
              return (
                <>
                  <input type="hidden" name="units_36" value="0" />
                  <input type="hidden" name="units_55" value="0" />
                </>
              )
            }

            return (
              <div className="border-t border-slate-800 pt-6 space-y-4">
                <h3 className="text-xs font-bold text-slate-350 uppercase tracking-widest">Incubation Units Count</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {hasInc36 ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Units incubated at 36°C</label>
                      <input
                        type="number"
                        name="units_36"
                        min="0"
                        defaultValue={initialShipment?.units_36 || 0}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                      />
                    </div>
                  ) : (
                    <input type="hidden" name="units_36" value="0" />
                  )}
                  {hasInc55 ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Units incubated at 55°C</label>
                      <input
                        type="number"
                        name="units_55"
                        min="0"
                        defaultValue={initialShipment?.units_55 || 0}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                      />
                    </div>
                  ) : (
                    <input type="hidden" name="units_55" value="0" />
                  )}
                </div>
              </div>
            )
          })()}

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-350 uppercase tracking-widest">Batches</h3>
              <button
                type="button"
                onClick={addBatchRow}
                className="flex items-center gap-1 px-3 py-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-[10px] font-bold text-slate-300 hover:text-white rounded-lg transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Batch</span>
              </button>
            </div>

            <div className="space-y-3">
              {batches.map((batch, idx) => {
                const parsed = parseBatchNumber(batch.number)
                return (
                  <div
                    key={idx}
                    data-id={batch.id || ''}
                    className="batch-form-row p-4 bg-slate-950/40 border border-slate-800 rounded-2xl flex items-end gap-4 relative pt-6"
                  >
                    <div className="absolute top-2 left-3 text-[9px] text-slate-600 font-bold uppercase">
                      Batch #{idx + 1}
                    </div>

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Batch Number (YY-JJJ)</label>
                        <input
                          type="text"
                          name="batch_number"
                          value={batch.number || ''}
                          onChange={(e) => handleBatchValChange(idx, 'number', e.target.value)}
                          placeholder="e.g. 26-168"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Production Date</label>
                        <input
                          type="date"
                          name="production_date"
                          value={batch.production_date || ''}
                          onChange={(e) => handleBatchValChange(idx, 'production_date', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Expiration Date</label>
                        <input
                          type="date"
                          name="expiration_date"
                          value={batch.expiration_date || ''}
                          onChange={(e) => handleBatchValChange(idx, 'expiration_date', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {batches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBatchRow(idx)}
                        className="p-2 bg-slate-800 border border-slate-850 hover:border-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/30">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-teal-500 hover:bg-teal-400 text-slate-955 text-xs font-bold rounded-xl transition-all"
          >
            Save Log
          </button>
        </div>
      </form>
    </div>
  )
}

function TemplateModal({ initialTemplate, onSave, onClose }) {
  const [selectedTests, setSelectedTests] = useState([])
  const [requiresIncubation, setRequiresIncubation] = useState(initialTemplate ? (initialTemplate.requires_incubation !== false) : true)
  const [incubation36, setIncubation36] = useState(initialTemplate?.incubation_36 || 0)
  const [incubation55, setIncubation55] = useState(initialTemplate?.incubation_55 || 0)

  useEffect(() => {
    if (initialTemplate && initialTemplate.tests) {
      setSelectedTests(initialTemplate.tests)
    }
    if (initialTemplate) {
      setRequiresIncubation(initialTemplate.requires_incubation !== false)
      setIncubation36(initialTemplate.incubation_36 || 0)
      setIncubation55(initialTemplate.incubation_55 || 0)
    }
  }, [initialTemplate])

  const toggleTest = (testId) => {
    if (selectedTests.includes(testId)) {
      setSelectedTests(selectedTests.filter(id => id !== testId))
    } else {
      setSelectedTests([...selectedTests, testId])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={onSave}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-white">{initialTemplate ? 'Edit Product Template' : 'Create Product Template'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Name</label>
              <input
                type="text"
                name="name"
                required
                defaultValue={initialTemplate?.name || ''}
                placeholder="e.g. Canned Tomato Sauce"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Description / Notes</label>
              <input
                type="text"
                name="packaging"
                defaultValue={initialTemplate?.packaging || ''}
                placeholder="e.g. Shared tests for canned tuna"
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
                  Requires Incubation Workflow
                </span>
              </label>
            </div>

            {requiresIncubation && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Incubation Days 36°C</label>
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
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Incubation Days 55°C</label>
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
            <h3 className="text-xs font-bold text-slate-350 uppercase tracking-widest">Select Tests & Configure Limits</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TESTS.map(test => {
                const isChecked = selectedTests.includes(test.id)
                const std = initialTemplate?.standards?.[test.id] || {}

                return (
                  <div
                    key={test.id}
                    className={`p-4 border rounded-2xl flex flex-col justify-between transition-all duration-200 ${
                      isChecked
                        ? 'bg-slate-950/40 border-teal-500/35 text-white'
                        : 'bg-slate-950/10 border-slate-850 text-slate-500'
                    }`}
                  >
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        name="tests"
                        value={test.id}
                        checked={isChecked}
                        onChange={() => toggleTest(test.id)}
                        className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-teal-600 focus:ring-teal-500/50"
                      />
                      <span className="text-xs font-bold">{test.name}</span>
                    </label>

                    {isChecked && test.standardsType !== 'none' && (
                      <div className="mt-3 grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/40">
                        {(test.standardsType === 'min' || test.standardsType === 'range') ? (
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-slate-450 uppercase block">
                              Min Threshold <span className="normal-case">{test.unit ? `(${test.unit})` : ''}</span>
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
                              Max Threshold <span className="normal-case">{test.unit ? `(${test.unit})` : ''}</span>
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

        <div className="px-6 py-4 border-t border-slate-855 flex justify-end gap-3 bg-slate-900/30">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
          >
            Save Template
          </button>
        </div>
      </form>
    </div>
  )
}

function AccountSettingsModal({ user, onClose, updateAccount, showToast }) {
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await updateAccount(email, password || null)
      showToast('Account updated successfully.', 'success')
      onClose()
    } catch (err) {
      alert(`Error updating account: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4"
      >
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">Account Settings</h2>
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
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Password (leave blank to keep current)</label>
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-teal-500 hover:bg-teal-400 disabled:bg-teal-500/50 text-slate-950 text-xs font-bold rounded-xl transition-all"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
