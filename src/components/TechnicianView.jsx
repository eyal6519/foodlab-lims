import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { TESTS, testMap, calculateTest, isTestEntered } from '../utils/calculations'
import { parseBatchNumber } from '../utils/batchParser'
import ReplicateModal from './ReplicateModal'
import ShipmentModal from './ShipmentModal'
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
  X
} from 'lucide-react'

export default function TechnicianView() {
  const { user, profile, logout, updateAccount } = useAuth()
  const [shipments, setShipments] = useState([])
  const [templates, setTemplates] = useState([])
  const [results, setResults] = useState({}) // batchId:testId -> replicates list
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'due' | 'intake' | 'templates'
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all') // 'all' | 'incubation' | 'bypass'

  // Modal State
  const [activeTestModal, setActiveTestModal] = useState(null) // { batch, test }
  const [shipmentModal, setShipmentModal] = useState(null) // { id, template_id, ... } or 'new'
  const [expandedShipmentId, setExpandedShipmentId] = useState(null)
  const [expandedBatchId, setExpandedBatchId] = useState(null)
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
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveResult = async (rows) => {
    if (!activeTestModal) return
    const { batch, test } = activeTestModal

    try {
      // Clean empty fields but keep checkboxes
      const cleanRows = rows.map(row => {
        const cleaned = {}
        Object.entries(row).forEach(([k, v]) => {
          cleaned[k] = v === '' ? null : v
        })
        return cleaned
      })

      // Insert or Update in Supabase
      const { error } = await supabase
        .from('test_results')
        .upsert(
          {
            batch_id: batch.id,
            test_id: test.id,
            replicates: cleanRows,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'batch_id,test_id' }
        )

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
      setResults(prev => ({
        ...prev,
        [`${batch.id}:${test.id}`]: cleanRows
      }))

      setActiveTestModal(null)
    } catch (err) {
      alert(`Error saving result: ${err.message}`)
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
      showToast(isNew ? 'Shipment logged successfully' : 'Shipment updated successfully')
    } catch (err) {
      alert(`Error saving shipment: ${err.message}`)
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
      alert(`Error toggling override: ${err.message}`)
    }
  }

  // Helpers
  const getTemplate = (id) => templates.find(t => t.id === id)

  const getIncubationStatus = (batch, templateId) => {
    const template = getTemplate(templateId)
    if (!template || !batch) return { required: false, locked: false, label: 'Ready' }
    
    if (template.requires_incubation === false) {
      return { required: false, locked: false, label: 'Ready' }
    }

    const needs36 = (batch.units_36 || 0) > 0 && (template.incubation_36 || 0) > 0
    const needs55 = (batch.units_55 || 0) > 0 && (template.incubation_55 || 0) > 0
    const required = needs36 || needs55

    // If manual unlock by admin is active, it overrides all incubation blocks
    if (batch.is_manually_unlocked) {
      return { required, locked: false, label: 'Unlocked by Admin' }
    }

    const exited = !!(batch.incubation_exited_at || batch.incubation_removed_early_at)
    
    // Check if target date is reached
    const today = new Date().toISOString().slice(0, 10)
    const due36 = needs36 ? (batch.exit_36 && batch.exit_36 <= today) : false
    const due55 = needs55 ? (batch.exit_55 && batch.exit_55 <= today) : false
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

  // Filter shipments
  const filteredShipments = shipments.filter(shipment => {
    const isCompleted = shipment.batches.length > 0 && shipment.batches.every(b => b.approved_at)
    if (isCompleted) return false // Hide completed shipments from technician view

    if (activeTab === 'due') {
      return shipment.batches.some(b => getIncubationStatus(b, shipment.template_id).due)
    }
    return true // 'pending' tab shows all active shipments
  })

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
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-xl text-teal-400">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Technician Dashboard</h1>
            <span className="text-[10px] uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
              Blind Entry Mode
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

      <main className="max-w-6xl mx-auto px-4 mt-8">
        {/* Navigation Tabs */}
        <div className="flex gap-2 p-1 bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl mb-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 ${
              activeTab === 'pending' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pending Shipments ({shipments.filter(s => s.batches.length > 0 && !s.batches.every(b => b.approved_at)).length})
          </button>
          <button
            onClick={() => setActiveTab('due')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 ${
              activeTab === 'due' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Incubation Attention ({shipments.filter(s => s.batches.some(b => getIncubationStatus(b, s.template_id).due)).length})
          </button>
          <button
            onClick={() => setActiveTab('intake')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 ${
              activeTab === 'intake' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Shipment Intake
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 ${
              activeTab === 'templates' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Product Templates
          </button>
        </div>

        {/* Shipments List */}
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
                return (
                  <div
                    key={s.id}
                    className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col justify-between gap-6 hover:border-slate-750 transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold text-white">{temp?.name}</h3>
                        <p className="text-xs text-slate-400">
                          Supplier: <span className="font-semibold text-slate-200">{s.supplier}</span> • 
                          Arrived: <span className="font-semibold text-slate-200">{s.intake_date}</span>
                          {s.size && ` • Size: ${s.size}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setShipmentModal(s)}
                          className="p-2 bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-white rounded-xl transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Batches count info & per-batch status */}
                    <div className="mt-4 space-y-2 border-t border-slate-800/60 pt-4">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Batches & Incubation Status</p>
                      <div className="grid grid-cols-1 gap-2.5">
                        {s.batches.map(b => {
                          const bStatus = getIncubationStatus(b, s.template_id)
                          return (
                            <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-2xl border border-slate-850">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-white">{b.number || 'Unnamed Batch'}</span>
                                {b.approved_at && <span className="text-emerald-400 text-xs font-semibold">✓ Approved</span>}
                                {bStatus.required && (
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                    bStatus.locked ? 'bg-red-950 text-red-400 border border-red-500/20' : 'bg-teal-950 text-teal-400 border border-teal-500/20'
                                  }`}>
                                    {bStatus.label}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {bStatus.required && !bStatus.exited && (
                                  <button
                                    onClick={() => toggleIncubationUnlock(b.id, b.is_manually_unlocked)}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all ${
                                      b.is_manually_unlocked
                                        ? 'bg-amber-955/20 border-amber-500/30 text-amber-400 hover:bg-amber-900/10'
                                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                    }`}
                                  >
                                    {b.is_manually_unlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                    <span>{b.is_manually_unlocked ? 'Re-lock' : 'Unlock'}</span>
                                  </button>
                                )}
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
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Product Specification Templates</h2>
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
                        placeholder="Search templates by product name..."
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
                        { id: 'all', label: 'All Templates' },
                        { id: 'incubation', label: 'Requires Incubation' },
                        { id: 'bypass', label: 'Bypass Incubation' }
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
                      No product templates match your search or filter criteria.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {filteredTemplates.map(t => (
                        <div
                          key={t.id}
                          className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col justify-between hover:border-slate-750 transition-all"
                        >
                          <div>
                            <div className="flex justify-between items-start gap-4">
                              <h3 className="text-base font-bold text-white">{t.name}</h3>
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
                  )}
                </>
              )
            })()}
          </div>
        )}

        {(activeTab === 'pending' || activeTab === 'due') && (
          filteredShipments.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
              <FileSpreadsheet className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-300">No shipments found</h3>
              <p className="text-slate-500 text-sm mt-1">
                There are no shipments matching this filter.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
            {filteredShipments.map(shipment => {
              const template = getTemplate(shipment.template_id)
              const isExpanded = expandedShipmentId === shipment.id
              const lockedBatchesCount = shipment.batches.filter(b => getIncubationStatus(b, shipment.template_id).locked).length
              const requiresIncubation = template?.requires_incubation !== false && shipment.batches.some(b => (b.units_36 || 0) > 0 || (b.units_55 || 0) > 0)

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
                        {template?.name || 'Unknown Product'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Supplier: <span className="font-semibold text-slate-200">{shipment.supplier}</span> • 
                        Arrived: <span className="font-semibold text-slate-200">{shipment.intake_date}</span>
                        {shipment.size && ` • Size: ${shipment.size}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {lockedBatchesCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-950/40 border border-red-500/35 text-red-400 text-xs font-bold rounded-full">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Locked ({lockedBatchesCount} Batches)</span>
                        </span>
                      ) : requiresIncubation ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/40 border border-emerald-500/35 text-emerald-400 text-xs font-bold rounded-full">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Incubation Done</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-950/40 border border-teal-500/35 text-teal-400 text-xs font-bold rounded-full">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Ready</span>
                        </span>
                      )}
                      <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full font-bold">
                        {shipment.batches.length} Batches
                      </span>
                    </div>
                  </div>

                  {/* Shipment Details Panel */}
                  {isExpanded && (
                    <div className="p-6 border-t border-slate-800 bg-slate-950/30 space-y-6">

                      {/* Batches Table */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          Batches for entry
                        </h4>
                        
                        {shipment.batches.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No batches recorded.</p>
                        ) : (
                          <div className="space-y-3">
                            {shipment.batches.map(batch => {
                              const isBatchExpanded = expandedBatchId === batch.id
                              const batchResultsCount = template?.tests.filter(tid => isTestEntered(tid, batch.id, results)).length || 0
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
                                        <span>Retest Requested: {batch.retest_reason}</span>
                                      </div>
                                    )}

                                    {/* Batch row header */}
                                    <div
                                      onClick={() => !bStatus.locked && setExpandedBatchId(isBatchExpanded ? null : batch.id)}
                                      className={`p-4 flex items-center justify-between gap-4 select-none ${
                                        bStatus.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-800/20'
                                      }`}
                                    >
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-bold text-white">{batch.number || 'Unnamed Batch'}</span>
                                          {bStatus.required && (
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                              bStatus.locked ? 'bg-red-950 text-red-400 border border-red-500/20' : 'bg-teal-950 text-teal-400 border border-teal-500/20'
                                            }`}>
                                              {bStatus.label}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                          Production: {batch.production_date || '-'} • Expiration: {batch.expiration_date || '-'}
                                          {bStatus.required && ` • Units: 36°C: ${batch.units_36 || 0} | 55°C: ${batch.units_55 || 0}`}
                                        </p>
                                      </div>

                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-slate-400 font-medium">
                                        Tests: {batchResultsCount}/{totalTestsCount}
                                      </span>
                                      {batchResultsCount === totalTestsCount ? (
                                        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20">
                                          Complete
                                        </span>
                                      ) : batchResultsCount > 0 ? (
                                        <span className="px-2 py-0.5 bg-amber-950 text-amber-400 text-[10px] font-bold rounded border border-amber-500/20">
                                          In Progress
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] font-bold rounded border border-slate-700">
                                          Pending
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Batch Tests Entry Forms */}
                                  {isBatchExpanded && !bStatus.locked && (
                                    <div className="p-4 border-t border-slate-850 bg-slate-950/20 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                      {template?.tests
                                        .filter(tid => {
                                          const t = TESTS.find(x => x.id === tid)
                                          return t && !t.isCalculated
                                        })
                                        .map(testId => {
                                        const test = TESTS.find(t => t.id === testId)
                                        if (!test) return null

                                        const repData = results[`${batch.id}:${testId}`] || []
                                        const isEntered = repData.length > 0

                                        const batchResults = {}
                                        if (template?.tests) {
                                          template.tests.forEach(tid => {
                                            batchResults[tid] = results[`${batch.id}:${tid}`] || []
                                          })
                                        }
                                        const calc = calculateTest(testId, repData, batchResults)

                                        return (
                                          <div
                                            key={testId}
                                            className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                                          >
                                            <div>
                                              <p className="text-xs font-semibold text-white">{test.name}</p>
                                              <p className="text-[10px] text-slate-400 mt-0.5">
                                                {isEntered ? (
                                                  <>
                                                    {repData.length} replicates
                                                    <span className="text-teal-400 ml-1 font-semibold">
                                                      ({calc.label})
                                                    </span>
                                                  </>
                                                ) : 'No data logged'}
                                              </p>
                                            </div>

                                            <button
                                              onClick={() => setActiveTestModal({ batch, test })}
                                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                                isEntered
                                                  ? 'bg-slate-800 hover:bg-slate-750 text-teal-400 border border-slate-700'
                                                  : 'bg-teal-500 hover:bg-teal-450 text-slate-950'
                                              }`}
                                            >
                                              {isEntered ? 'Edit' : 'Enter'}
                                            </button>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </main>

      {/* Replicates Modal Portal */}
      {activeTestModal && (
        <ReplicateModal
          test={activeTestModal.test}
          batchNumber={activeTestModal.batch.number || 'Unnamed Batch'}
          initialRows={results[`${activeTestModal.batch.id}:${activeTestModal.test.id}`]}
          onSave={handleSaveResult}
          onClose={() => setActiveTestModal(null)}
        />
      )}

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
