import { supabaseAdmin as supabase } from '../lib/supabase'

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

    // Fetch existing technician to pre-assign mock data for verification
    const { data: profiles } = await supabase.from('profiles').select('*')
    const firstTechId = profiles?.find(p => p.role === 'technician')?.id || null
    const assignedArray = firstTechId ? [firstTechId] : []

    // --- Create Product Template with ALL tests ---
    const allTestsTemplateId = generateUUID()
    const templates = [
      {
        id: allTestsTemplateId,
        name: 'All-Tests Master Spec',
        packaging: 'Standard Demo Packaging',
        requires_incubation: true,
        incubation_36: 5,
        incubation_55: 3,
        tests: [
          'labeling_packaging', 'weight', 'volume', 'vacuum', 'vacuum_before', 'vacuum_36', 'vacuum_55',
          'drained_weight', 'ph', 'ph_before', 'ph_36', 'ph_55', 'moisture_device', 'moisture_oven',
          'brix', 'acidity', 'ash', 'acid_insoluble_ash', 'sieving_size', 'salt', 'specific_gravity',
          'aqueous_layer', 'organoleptic', 'peroxides', 'drip_loss', 'water_activity', 'paprika_asta',
          'fat_separation', 'oxygen_analyzer', 'filling_coating', 'salt_auto', 'acidity_auto',
          'tuna_chunk', 'foreign_matter', 'general_ratio', 'custom_ratio_chalk', 'custom_single_cucumbers'
        ],
        standards: {
          weight: { min: 100, max: 200 },
          volume: { min: 90, max: 180 },
          vacuum: { min: 5, max: 30 },
          vacuum_before: { min: 5, max: 30 },
          vacuum_36: { min: 5, max: 30 },
          vacuum_55: { min: 5, max: 30 },
          drained_weight: { min: 80, max: 150 },
          ph: { min: 4.0, max: 6.8 },
          ph_before: { min: 4.0, max: 6.8 },
          ph_36: { min: 4.0, max: 6.8 },
          ph_55: { min: 4.0, max: 6.8 },
          moisture_device: { min: 10, max: 40 },
          moisture_oven: { min: 10, max: 40 },
          brix: { min: 10, max: 30 },
          acidity: { min: 0.1, max: 2.0 },
          ash: { min: 0.1, max: 5.0 },
          acid_insoluble_ash: { min: 0.01, max: 1.0 },
          sieving_size: { min: 0, max: 100 },
          salt: { min: 0.5, max: 3.0 },
          specific_gravity: { min: 0.9, max: 1.2 },
          aqueous_layer: { min: 0, max: 10 },
          peroxides: { min: 0, max: 15 },
          drip_loss: { min: 0, max: 12 },
          water_activity: { min: 0.5, max: 0.95 },
          paprika_asta: { min: 50, max: 180 },
          fat_separation: { min: 0, max: 5 },
          oxygen_analyzer: { min: 0, max: 5 },
          filling_coating: { min: 10, max: 50 },
          salt_auto: { min: 0.5, max: 3.0 },
          acidity_auto: { min: 0.1, max: 2.0 },
          tuna_chunk: { min: 50, max: 95 },
          general_ratio: { min: 10, max: 90 },
          custom_ratio_chalk: { min: 0, max: 5 },
          custom_single_cucumbers: { min: 8, max: 12 },
          _customTests: [
            {
              id: 'custom_ratio_chalk',
              name: 'Chalk defects % (Custom)',
              unit: '%',
              type: 'ratio',
              numeratorLabel: 'Chalk defects weight (g)',
              denominatorLabel: 'Average grain sample weight (g)',
              standardsType: 'range'
            },
            {
              id: 'custom_single_cucumbers',
              name: 'Cucumbers Count (Custom)',
              unit: 'units',
              type: 'single',
              valueLabel: 'Count of cucumbers in jar',
              standardsType: 'range'
            }
          ]
        }
      }
    ]

    const { error: tempErr } = await supabase.from('product_templates').insert(templates)
    if (tempErr) throw tempErr

    // --- Create Shipments representing the 4 exit states ---
    const now = new Date()

    // 1. Demo: Exited 36°C Only
    const shipExited36Id = generateUUID()
    const intakeExited36 = new Date()
    intakeExited36.setDate(now.getDate() - 6) // received 6 days ago
    const exitExited36_36 = new Date(intakeExited36)
    exitExited36_36.setDate(intakeExited36.getDate() + 5) // exited yesterday (day 5)
    const exitExited36_55 = new Date(intakeExited36)
    exitExited36_55.setDate(intakeExited36.getDate() + 8) // exits in 2 days (day 8)

    // 2. Demo: Exited 55°C Only
    const shipExited55Id = generateUUID()
    const intakeExited55 = new Date()
    intakeExited55.setDate(now.getDate() - 4) // received 4 days ago
    const exitExited55_36 = new Date(intakeExited55)
    exitExited55_36.setDate(intakeExited55.getDate() + 6) // exits in 2 days (day 6)
    const exitExited55_55 = new Date(intakeExited55)
    exitExited55_55.setDate(intakeExited55.getDate() + 3) // exited yesterday (day 3)

    // 3. Demo: Exited Both
    const shipExitedBothId = generateUUID()
    const intakeExitedBoth = new Date()
    intakeExitedBoth.setDate(now.getDate() - 7) // received 7 days ago
    const exitExitedBoth_36 = new Date(intakeExitedBoth)
    exitExitedBoth_36.setDate(intakeExitedBoth.getDate() + 5) // exited 2 days ago (day 5)
    const exitExitedBoth_55 = new Date(intakeExitedBoth)
    exitExitedBoth_55.setDate(intakeExitedBoth.getDate() + 3) // exited 4 days ago (day 3)

    // 4. Demo: Active Incubation (Locked)
    const shipActiveId = generateUUID()
    const intakeActive = new Date() // received today
    const exitActive_36 = new Date(intakeActive)
    exitActive_36.setDate(intakeActive.getDate() + 5) // exits in 5 days
    const exitActive_55 = new Date(intakeActive)
    exitActive_55.setDate(intakeActive.getDate() + 3) // exits in 3 days

    const shipments = [
      {
        id: shipExited36Id,
        template_id: allTestsTemplateId,
        supplier: 'Demo Supplier (Exited 36 Only)',
        intake_date: formatDate(intakeExited36),
        size: '10,000 units',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitExited36_36),
        exit_55: formatDate(exitExited36_55),
        is_manually_unlocked: false,
        assigned_to: assignedArray
      },
      {
        id: shipExited55Id,
        template_id: allTestsTemplateId,
        supplier: 'Demo Supplier (Exited 55 Only)',
        intake_date: formatDate(intakeExited55),
        size: '10,000 units',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitExited55_36),
        exit_55: formatDate(exitExited55_55),
        is_manually_unlocked: false,
        assigned_to: assignedArray
      },
      {
        id: shipExitedBothId,
        template_id: allTestsTemplateId,
        supplier: 'Demo Supplier (Exited Both)',
        intake_date: formatDate(intakeExitedBoth),
        size: '10,000 units',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitExitedBoth_36),
        exit_55: formatDate(exitExitedBoth_55),
        is_manually_unlocked: false,
        assigned_to: assignedArray
      },
      {
        id: shipActiveId,
        template_id: allTestsTemplateId,
        supplier: 'Demo Supplier (Active Incubation - Locked)',
        intake_date: formatDate(intakeActive),
        size: '10,000 units',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitActive_36),
        exit_55: formatDate(exitActive_55),
        is_manually_unlocked: false,
        assigned_to: assignedArray
      }
    ]

    const { error: shipErr } = await supabase.from('shipments').insert(shipments)
    if (shipErr) throw shipErr

    // --- Create Batches ---
    const batchExited36Id = generateUUID()
    const batchExited55Id = generateUUID()
    const batchExitedBothId = generateUUID()
    const batchActiveId = generateUUID()

    const batches = [
      {
        id: batchExited36Id,
        number: 'DEMO-EXIT36',
        shipment_id: shipExited36Id,
        production_date: formatDate(intakeExited36),
        expiration_date: '2029-06-19',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitExited36_36),
        exit_55: formatDate(exitExited36_55),
        is_manually_unlocked: false
      },
      {
        id: batchExited55Id,
        number: 'DEMO-EXIT55',
        shipment_id: shipExited55Id,
        production_date: formatDate(intakeExited55),
        expiration_date: '2029-06-19',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitExited55_36),
        exit_55: formatDate(exitExited55_55),
        is_manually_unlocked: false
      },
      {
        id: batchExitedBothId,
        number: 'DEMO-EXITBOTH',
        shipment_id: shipExitedBothId,
        production_date: formatDate(intakeExitedBoth),
        expiration_date: '2029-06-19',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitExitedBoth_36),
        exit_55: formatDate(exitExitedBoth_55),
        is_manually_unlocked: false
      },
      {
        id: batchActiveId,
        number: 'DEMO-LOCKED',
        shipment_id: shipActiveId,
        production_date: formatDate(intakeActive),
        expiration_date: '2029-06-19',
        units_36: 12,
        units_55: 12,
        exit_36: formatDate(exitActive_36),
        exit_55: formatDate(exitActive_55),
        is_manually_unlocked: false
      }
    ]

    const { error: batchErr } = await supabase.from('batches').insert(batches)
    if (batchErr) throw batchErr

    // --- Create Initial Test Results (to make the UI feel populated for demonstration) ---
    const testResults = [
      {
        id: generateUUID(),
        batch_id: batchExitedBothId,
        test_id: 'ph_before',
        replicates: [{ value: '6.2' }],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchExitedBothId,
        test_id: 'weight',
        replicates: [{ gross: '150.000', tare: '5.000', net: '145.000' }],
        updated_at: formatTimestamp(now)
      },
      {
        id: generateUUID(),
        batch_id: batchExited36Id,
        test_id: 'ph_before',
        replicates: [{ value: '6.1' }],
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
