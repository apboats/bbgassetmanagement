// Supabase Edge Function: dockmaster-internal-workorders-incremental
// Incremental sync of changed work orders and time entries
// Designed to run every 5 minutes via cron, checking last 15 minutes of changes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Internal customer ID for BBG dealership
const INTERNAL_CUSTOMER_ID = '3112'

// Lookback window in minutes (check 15 min to avoid missing any changes)
const LOOKBACK_MINUTES = 15

// Authenticate with Dockmaster API
async function authenticateDockmaster(username: string, password: string) {
  const authResponse = await fetch('https://auth.dmeapi.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserName: username, Password: password }),
  })

  if (!authResponse.ok) {
    throw new Error(`Authentication failed: ${authResponse.status}`)
  }

  const authData = await authResponse.json()
  const authToken = authData.authToken
  const systemId = authData.availableConnections?.[0]?.systemId

  if (!authToken || !systemId) {
    throw new Error('Authentication response missing token or systemId')
  }

  return { authToken, systemId }
}

// Format date for Dockmaster API (URL encoded)
function formatDateForApi(date: Date): string {
  // Format: YYYY-MM-DDTHH:MM:SS
  return encodeURIComponent(date.toISOString().split('.')[0])
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let workOrdersUpdated = 0
  let timeEntriesProcessed = 0

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get last sync time
    const { data: syncStatus } = await supabase
      .from('sync_status')
      .select('last_sync')
      .eq('id', 'internal_workorders')
      .single()

    // Calculate lookback time (max of last_sync or 15 minutes ago)
    const now = new Date()
    const fifteenMinutesAgo = new Date(now.getTime() - LOOKBACK_MINUTES * 60 * 1000)
    const lastSync = syncStatus?.last_sync ? new Date(syncStatus.last_sync) : null

    let lookbackTime: Date
    if (lastSync && lastSync > fifteenMinutesAgo) {
      // Use last sync time if it's within the lookback window
      lookbackTime = lastSync
    } else {
      // Otherwise use 15 minutes ago
      lookbackTime = fifteenMinutesAgo
    }

    console.log('Incremental sync starting, lookback from:', lookbackTime.toISOString())

    // Get Dockmaster credentials
    const { data: config, error: configError } = await supabase
      .from('dockmaster_config')
      .select('username, password')
      .limit(1)
      .single()

    if (configError || !config?.username || !config?.password) {
      throw new Error('Dockmaster credentials not configured')
    }

    // Authenticate with Dockmaster
    const { authToken, systemId } = await authenticateDockmaster(config.username, config.password)

    const dmHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'X-DM_SYSTEM_ID': systemId,
    }

    // ========== STEP 1: Get changed work orders ==========
    const listChangedUrl = `https://api.dmeapi.com/api/v1/Service/WorkOrders/ListNewOrChanged?LastUpdate=${formatDateForApi(lookbackTime)}&PageSize=100`
    console.log('Fetching changed work orders:', listChangedUrl)

    const changedResponse = await fetch(listChangedUrl, {
      method: 'GET',
      headers: dmHeaders,
    })

    if (changedResponse.ok) {
      const changedData = await changedResponse.json()
      const changedWorkOrders = changedData.content || []
      console.log('Changed work orders found:', changedWorkOrders.length)

      // Filter for internal customer only
      const internalWorkOrders = changedWorkOrders.filter(
        (wo: any) => wo.customerID === INTERNAL_CUSTOMER_ID
      )
      console.log('Internal work orders to update:', internalWorkOrders.length)

      // Process each changed internal work order
      for (const wo of internalWorkOrders) {
        const workOrderData = {
          id: wo.id,
          customer_id: INTERNAL_CUSTOMER_ID,
          boat_id: null,
          rigging_id: wo.riggingId || null,
          rigging_type: wo.riggingType || null,
          is_internal: true,
          creation_date: wo.creationDate,
          category: wo.category,
          status: wo.status,
          title: wo.title,
          boat_name: wo.boatName || '',
          boat_year: wo.boatYear || '',
          boat_make: wo.boatMake || '',
          boat_model: wo.boatModel || '',
          boat_serial_number: wo.boatSerialNumber || '',
          total_charges: wo.totalWOCharges || 0,
          total_parts: wo.totalParts || 0,
          total_labor: wo.totalLabor || 0,
          total_labor_hours: wo.totalLaborHours || 0,
          est_comp_date: wo.estCompDate || null,
          promised_date: wo.promisedDate || null,
          comments: wo.comments || '',
          last_synced: new Date().toISOString(),
        }

        // Upsert work order
        const { error: woError } = await supabase
          .from('work_orders')
          .upsert(workOrderData, { onConflict: 'id' })

        if (woError) {
          console.error('Error upserting work order:', wo.id, woError)
          continue
        }

        // Update operations if present in response
        if (wo.operations && wo.operations.length > 0) {
          // Delete old operations
          await supabase
            .from('work_order_operations')
            .delete()
            .eq('work_order_id', wo.id)

          // Insert new operations
          const opsWithWoId = wo.operations.map((op: any) => ({
            id: op.id,
            work_order_id: wo.id,
            opcode: op.opcode,
            opcode_desc: op.opcodeDesc,
            status: op.status,
            type: op.type,
            category: op.category,
            flag_labor_finished: op.flagLaborFinished || false,
            total_charges: op.totalCharges || 0,
            total_parts: op.totalParts || 0,
            total_labor: op.totalLabor || 0,
            total_labor_hours: op.totalLaborHours || 0,
            labor_billed: op.laborBilled || 0,
            total_to_complete: op.totalToComplete || 0,
            long_desc: op.longDesc || '',
            tech_desc: op.techDesc || '',
            est_start_date: op.estStartDate || null,
            est_complete_date: op.estCompleteDate || null,
          }))

          await supabase
            .from('work_order_operations')
            .insert(opsWithWoId)
        }

        workOrdersUpdated++
      }

      // Handle pagination if needed
      if (changedData.maxPages > 1) {
        console.log(`Note: ${changedData.maxPages} pages available, only processed first page`)
      }
    } else {
      console.error('Failed to fetch changed work orders:', changedResponse.status)
    }

    // ========== STEP 2: Get time entries for labor completion tracking ==========
    const timeEntryUrl = `https://api.dmeapi.com/api/v1/Service/WorkOrders/ListTimeEntry?StartDate=${formatDateForApi(lookbackTime)}&EndDate=${formatDateForApi(now)}&PageSize=100&Detail=true`
    console.log('Fetching time entries:', timeEntryUrl)

    const timeEntryResponse = await fetch(timeEntryUrl, {
      method: 'GET',
      headers: dmHeaders,
    })

    if (timeEntryResponse.ok) {
      const timeEntryData = await timeEntryResponse.json()
      const timeEntries = timeEntryData.content || []
      console.log('Time entries found:', timeEntries.length)

      // Group time entries by work order and opcode
      const timeEntryMap = new Map<string, any[]>()
      for (const entry of timeEntries) {
        const key = `${entry.workOrderId}-${entry.opCode}`
        if (!timeEntryMap.has(key)) {
          timeEntryMap.set(key, [])
        }
        timeEntryMap.get(key)!.push(entry)
      }

      // Update operation statuses based on time entries
      // A time entry with stopTime indicates labor was completed
      for (const [key, entries] of timeEntryMap) {
        const [workOrderId, opCode] = key.split('-')

        // Check if any time entry has a stop time (indicates work completed)
        const hasCompletedTime = entries.some((e: any) => e.stopTime)

        if (hasCompletedTime) {
          // Update the operation's flag_labor_finished if work was clocked out
          const { error: updateError } = await supabase
            .from('work_order_operations')
            .update({
              flag_labor_finished: true,
              updated_at: new Date().toISOString(),
            })
            .eq('work_order_id', workOrderId)
            .eq('opcode', opCode)

          if (!updateError) {
            timeEntriesProcessed++
          }
        }
      }
    } else {
      console.error('Failed to fetch time entries:', timeEntryResponse.status)
    }

    // Update sync status
    await supabase
      .from('sync_status')
      .upsert({
        id: 'internal_workorders',
        last_sync: now.toISOString(),
        last_success: now.toISOString(),
        status: 'success',
        records_synced: workOrdersUpdated,
        error_message: null,
        updated_at: now.toISOString(),
      }, { onConflict: 'id' })

    const duration = (Date.now() - startTime) / 1000

    return new Response(
      JSON.stringify({
        success: true,
        workOrdersUpdated,
        timeEntriesProcessed,
        lookbackFrom: lookbackTime.toISOString(),
        duration: `${duration.toFixed(1)}s`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Incremental sync error:', error)

    // Update sync status to error
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    await supabase
      .from('sync_status')
      .upsert({
        id: 'internal_workorders',
        status: 'error',
        error_message: error.message,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        duration: `${(Date.now() - startTime) / 1000}s`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
