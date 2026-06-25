import { supabase } from '../lib/supabase'

// Helper to generate UUIDs in the browser
function generateUUID() {
  return crypto.randomUUID()
}

// Format date helper (YYYY-MM-DD)
function formatDate(date) {
  return date.toISOString().split('T')[0]
}

// Format timestamp helper
function formatTimestamp(date) {
  return date.toISOString()
}

// 1. Clear database function
export async function clearAllData() {
  try {
    // Delete test results first due to foreign keys
    const { error: testErr } = await supabase.from('test_results').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (testErr) throw testErr

    // Delete batches
    const { error: batchErr } = await supabase.from('batches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (batchErr) throw batchErr

    // Delete shipments
    const { error: shipErr } = await supabase.from('shipments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (shipErr) throw shipErr

    // Delete product templates
    const { error: tempErr } = await supabase.from('product_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (tempErr) throw tempErr

    return { success: true }
  } catch (err) {
    console.error('Error clearing data:', err)
    return { success: false, error: err.message }
  }
}

// 2. Main data seeder
export async function seedMockData() {
  try {
    // First, clear everything
    await clearAllData()

    // --- Create Product Templates ---
    const tunaTemplateId = generateUUID()
    const jamTemplateId = generateUUID()

    const templates = [
      {
        id: tunaTemplateId,
        name: 'Canned Tuna 160g',
        packaging: 'Metal Can',
        requires_incubation: true,
        incubation_36: 5,
        incubation_55: 3,
        tests: ['weight', 'ph_before', 'ph_36', 'ph_55', 'vacuum_before', 'vacuum_36', 'vacuum_55', 'organoleptic'],
        standards: {
          weight: { min: 155, max: 165 },
          ph_before: { min: 5.5, max: 6.5 },
          ph_36: { min: 5.5, max: 6.5 },
          ph_55: { min: 5.5, max: 6.5 },
          vacuum_before: { min: 10, max: 50 },
          vacuum_36: { min: 10, max: 50 },
          vacuum_55: { min: 10, max: 50 }
        }
      },
      {
        id: jamTemplateId,
        name: 'Peach Jam 250g',
        packaging: 'Glass Jar',
        requires_incubation: false,
        incubation_36: 0,
        incubation_55: 0,
        tests: ['brix', 'ph', 'organoleptic'],
        standards: {
          brix: { min: 60, max: 65 },
          ph: { min: 3.2, max: 4.0 }
        }
      }
    ]

    const { error: tempErr } = await supabase.from('product_templates').insert(templates)
    if (tempErr) throw tempErr

    // --- Create Shipments ---
    const now = new Date()

    // 1. Shipment locked in incubation (Canned Tuna)
    const intakeLocked = new Date()
    intakeLocked.setDate(now.getDate() - 2) // 2 days ago
    const exitLocked36 = new Date(intakeLocked)
    exitLocked36.setDate(intakeLocked.getDate() + 5)
    const exitLocked55 = new Date(intakeLocked)
    exitLocked55.setDate(intakeLocked.getDate() + 3)

    const shipLockedId = generateUUID()

    // 2. Shipment finished incubation (Canned Tuna)
    const intakeFinished = new Date()
    intakeFinished.setDate(now.getDate() - 10) // 10 days ago
    const exitFinished36 = new Date(intakeFinished)
    exitFinished36.setDate(intakeFinished.getDate() + 5)
    const exitFinished55 = new Date(intakeFinished)
    exitFinished55.setDate(intakeFinished.getDate() + 3)

    const shipFinishedId = generateUUID()

    // 3. Shipment bypassing incubation (Peach Jam)
    const intakeBypass = new Date() // Today
    const shipBypassId = generateUUID()

    // 4. Shipment for Retest scenario (Peach Jam)
    const intakeRetest = new Date()
    const shipRetestId = generateUUID()

    // 5. Shipment partially exited (55°C exited, 36°C locked)
    const intakePartial = new Date()
    intakePartial.setDate(now.getDate() - 4) // 4 days ago
    const exitPartial36 = new Date(intakePartial)
    exitPartial36.setDate(intakePartial.getDate() + 5) // exits in 1 day (tomorrow)
    const exitPartial55 = new Date(intakePartial)
    exitPartial55.setDate(intakePartial.getDate() + 3) // exited 1 day ago (yesterday)

    const shipPartialId = generateUUID()

    const shipments = [
      {
        id: shipLockedId,
        template_id: tunaTemplateId,
        supplier: 'Pacific Fish Co.',
        intake_date: formatDate(intakeLocked),
        size: '10,000 units',
        units_36: 0,
        units_55: 0,
        exit_36: null,
        exit_55: null,
        is_manually_unlocked: false
      },
      {
        id: shipFinishedId,
        template_id: tunaTemplateId,
        supplier: 'Atlantic Catch Ltd.',
        intake_date: formatDate(intakeFinished),
        size: '5,000 units',
        units_36: 0,
        units_55: 0,
        exit_36: null,
        exit_55: null,
        is_manually_unlocked: false
      },
      {
        id: shipBypassId,
        template_id: jamTemplateId,
        supplier: 'Sweet Orchards Inc.',
        intake_date: formatDate(intakeBypass),
        size: '2,500 units',
        units_36: 0,
        units_55: 0,
        exit_36: null,
        exit_55: null,
        is_manually_unlocked: false
      },
      {
        id: shipRetestId,
        template_id: jamTemplateId,
        supplier: 'Fruit Growers Coop',
        intake_date: formatDate(intakeRetest),
        size: '1,200 units',
        units_36: 0,
        units_55: 0,
        exit_36: null,
        exit_55: null,
        is_manually_unlocked: false
      },
      {
        id: shipPartialId,
        template_id: tunaTemplateId,
        supplier: 'Indian Ocean Fisheries',
        intake_date: formatDate(intakePartial),
        size: '8,000 units',
        units_36: 0,
        units_55: 0,
        exit_36: null,
        exit_55: null,
        is_manually_unlocked: false
      }
    ]

    const { error: shipErr } = await supabase.from('shipments').insert(shipments)
    if (shipErr) throw shipErr

    // --- Create Batches ---
    const batchLockedId = generateUUID()
    const batchFinished1Id = generateUUID()
    const batchFinished2Id = generateUUID()
    const batchBypassId = generateUUID()
    const batchRetestId = generateUUID()
    const batchPartialId = generateUUID()

    const batches = [
      {
        id: batchLockedId,
        shipment_id: shipLockedId,
        number: '26-170', // Julian date batch number example (June 19, 2026 is day 170)
        production_date: '2026-06-19',
        expiration_date: '2029-06-19',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitLocked36),
        exit_55: formatDate(exitLocked55),
        is_manually_unlocked: false
      },
      {
        id: batchFinished1Id,
        shipment_id: shipFinishedId,
        number: '26-160', // June 9, 2026
        production_date: '2026-06-09',
        expiration_date: '2029-06-09',
        approved_at: formatTimestamp(now),
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitFinished36),
        exit_55: formatDate(exitFinished55),
        is_manually_unlocked: false
      },
      {
        id: batchFinished2Id,
        shipment_id: shipFinishedId,
        number: '26-161', // June 10, 2026
        production_date: '2026-06-10',
        expiration_date: '2029-06-10',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitFinished36),
        exit_55: formatDate(exitFinished55),
        is_manually_unlocked: false
      },
      {
        id: batchBypassId,
        shipment_id: shipBypassId,
        number: '26-170', // Today
        production_date: '2026-06-19',
        expiration_date: '2028-06-19',
        units_36: 0,
        units_55: 0,
        exit_36: null,
        exit_55: null,
        is_manually_unlocked: false
      },
      {
        id: batchRetestId,
        shipment_id: shipRetestId,
        number: '26-169', // Yesterday
        production_date: '2026-06-18',
        expiration_date: '2028-06-18',
        retest_requested_at: formatTimestamp(now),
        retest_reason: 'Brix average failed specifications. Value was 55.4 (min is 60.0)',
        units_36: 0,
        units_55: 0,
        exit_36: null,
        exit_55: null,
        is_manually_unlocked: false
      },
      {
        id: batchPartialId,
        shipment_id: shipPartialId,
        number: '26-166', // 4 days ago
        production_date: '2026-06-15',
        expiration_date: '2029-06-15',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitPartial36),
        exit_55: formatDate(exitPartial55),
        is_manually_unlocked: false
      }
    ]

    const { error: batchErr } = await supabase.from('batches').insert(batches)
    if (batchErr) throw batchErr

    // --- Create Test Results (Failure for Retest Batch and Passing/Approved for Finished Batch) ---
    const testResults = [
      {
        id: generateUUID(),
        batch_id: batchRetestId,
        test_id: 'brix',
        replicates: [
          { value: '55.2' },
          { value: '55.6' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchRetestId,
        test_id: 'ph',
        replicates: [
          { value: '3.5' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchFinished1Id,
        test_id: 'weight',
        replicates: [
          { gross: '165.0', tare: '5.0', net: '160.0' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchFinished1Id,
        test_id: 'ph_before',
        replicates: [
          { value: '6.0' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchFinished1Id,
        test_id: 'ph_36',
        replicates: [
          { value: '6.1' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchFinished1Id,
        test_id: 'ph_55',
        replicates: [
          { value: '5.9' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchFinished1Id,
        test_id: 'vacuum_before',
        replicates: [
          { hg: '1.0' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchFinished1Id,
        test_id: 'vacuum_36',
        replicates: [
          { hg: '1.1' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchFinished1Id,
        test_id: 'vacuum_55',
        replicates: [
          { hg: '1.2' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchFinished1Id,
        test_id: 'organoleptic',
        replicates: [
          { pass: 'pass', reason: 'Passes sensory' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchPartialId,
        test_id: 'ph_before',
        replicates: [
          { value: '5.9' }
        ],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchPartialId,
        test_id: 'vacuum_before',
        replicates: [
          { hg: '1.2' }
        ],
        updated_at: formatTimestamp(now)
      }
    ]

    const { error: testResultErr } = await supabase.from('test_results').insert(testResults)
    if (testResultErr) throw testResultErr

    return { success: true }
  } catch (err) {
    console.error('Error seeding data:', err)
    return { success: false, error: err.message }
  }
}

// 3. Create default QA users (deletes existing ones first if they are not the active user, to allow password reset)
export async function seedQAUsers() {
  try {
    const results = []
    
    // Get currently logged-in user to avoid self-deletion attempts
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    // Query existing QA profiles
    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('email', ['manager@foodlab.com', 'technician@foodlab.com'])

    if (existingProfiles && existingProfiles.length > 0) {
      for (const prof of existingProfiles) {
        if (currentUser && prof.id === currentUser.id) {
          console.warn(`Skipping deletion of currently logged-in profile: ${prof.email}`)
          continue
        }
        
        // Delete existing profile
        const { error: deleteErr } = await supabase.rpc('admin_delete_user', {
          target_user_id: prof.id
        })
        if (deleteErr) {
          console.error(`Failed to delete profile ${prof.email}:`, deleteErr.message)
        } else {
          console.log(`Deleted old profile: ${prof.email}`)
        }
      }
    }
    
    // Create Manager
    const { data: managerData, error: managerErr } = await supabase.rpc('admin_create_user', {
      user_email: 'manager@foodlab.com',
      user_password: 'password123',
      user_role: 'manager',
      user_name: 'QA Manager'
    })
    if (managerErr) {
      console.warn('Could not create QA Manager (might already exist):', managerErr.message)
      results.push({ user: 'manager', status: 'skipped', detail: managerErr.message })
    } else {
      results.push({ user: 'manager', status: 'created', id: managerData })
    }

    // Create Technician
    const { data: techData, error: techErr } = await supabase.rpc('admin_create_user', {
      user_email: 'technician@foodlab.com',
      user_password: 'password123',
      user_role: 'technician',
      user_name: 'QA Technician'
    })
    if (techErr) {
      console.warn('Could not create QA Technician (might already exist):', techErr.message)
      results.push({ user: 'technician', status: 'skipped', detail: techErr.message })
    } else {
      results.push({ user: 'technician', status: 'created', id: techData })
    }

    return { success: true, results }
  } catch (err) {
    console.error('Error seeding QA users:', err)
    return { success: false, error: err.message }
  }
}

