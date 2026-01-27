// Supabase Edge Function: dockmaster-workorders-incremental
// Incremental sync of ALL changed work orders and time entries
// Designed to run every 5 minutes via cron, checking last 15 minutes of changes
// Handles both internal (rigging_id) and customer (boat_id) work orders

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

// Format date for Dockmaster API (converts to EST/EDT)
function formatDateForApi(date: Date): string {
  // Dockmaster expects Eastern Time, not UTC
  // Format: YYYY-MM-DDTHH:MM:SS.sss URL-encoded (colons as %3A)
  const estString = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  // Convert "01/23/2026, 19:45:00" to "2026-01-23T19:45:00.000"
  const [datePart, timePart] = estString.split(', ')
  const [month, day, year] = datePart.split('/')
  const isoFormat = `${year}-${month}-${day}T${timePart}.000`
  return encodeURIComponent(isoFormat)
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
      .eq('id', 'workorders_incremental')
      .single()

    // Calculate lookback time - always look back at least 15 minutes
    // If last_sync is OLDER than 15 minutes ago, use that to catch up on missed changes
    const now = new Date()
    const fifteenMinutesAgo = new Date(now.getTime() - LOOKBACK_MINUTES * 60 * 1000)
    const lastSync = syncStatus?.last_sync ? new Date(syncStatus.last_sync) : null

    let lookbackTime: Date
    if (lastSync && lastSync < fifteenMinutesAgo) {
      // Last sync was more than 15 minutes ago - use it to catch up
      lookbackTime = lastSync
    } else {
      // Normal case: look back 15 minutes
      lookbackTime = fifteenMinutesAgo
    }

    console.log('Incremental sync starting, lookback from (UTC):', lookbackTime.toISOString())
    console.log('Lookback in EST:', formatDateForApi(lookbackTime))

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
    const listChangedUrl = `https://api.dmeapi.com/api/v1/Service/WorkOrders/ListNewOrChanged?LastUpdate=${formatDateForApi(lookbackTime)}&Page=1&PageSize=100`
    console.log('Fetching changed work orders:', listChangedUrl)

    const changedResponse = await fetch(listChangedUrl, {
      method: 'GET',
      headers: dmHeaders,
    })

    if (changedResponse.ok) {
      const changedData = await changedResponse.json()
      const changedWorkOrders = changedData.content || []
      console.log('Changed work orders found:', changedWorkOrders.length)

      // Process ALL changed work orders (not just internal)
      for (const wo of changedWorkOrders) {
        // Debug: log boat-related fields from API response
        console.log(`WO ${wo.id}: boatId=${wo.boatId}, riggingId=${wo.riggingId}, customerID=${wo.customerID}`)

        // Determine if this is internal (has rigging_id) or customer work order
        const isInternal = !!wo.riggingId || wo.customerID === INTERNAL_CUSTOMER_ID

        // For customer work orders, try to find matching boat UUID
        // Note: If rigging_id exists, Dockmaster sets boatId = riggingId, so ignore boatId in that case
        let boatUuid = null
        if (!isInternal && !wo.riggingId && wo.boatId) {
          const { data: matchingBoat } = await supabase
            .from('boats')
            .select('id')
            .eq('dockmaster_id', wo.boatId)
            .single()
          console.log(`  Looking for boat with dockmaster_id=${wo.boatId}, found: ${matchingBoat?.id || 'none'}`)
          boatUuid = matchingBoat?.id || null
        }

        const workOrderData = {
          id: wo.id,
          customer_id: wo.customerID,
          customer_name: wo.customerName || '',
          clerk_id: wo.clerkId || null,
          boat_id: boatUuid,
          dockmaster_boat_id: wo.boatId || null,  // Store raw Dockmaster boat ID for backfill matching
          rigging_id: wo.riggingId || null,
          rigging_type: wo.riggingType || null,
          is_internal: isInternal,
          type: wo.type || null,
          tax_schema: wo.taxSchema || null,
          location_code: wo.locationCode || null,
          is_estimate: wo.isEstimate || false,
          creation_date: wo.creationDate,
          category: wo.category,
          status: wo.status,
          title: wo.title,
          // Boat details
          boat_name: wo.boatName || '',
          boat_year: wo.boatYear || '',
          boat_make: wo.boatMake || '',
          boat_model: wo.boatModel || '',
          boat_serial_number: wo.boatSerialNumber || '',
          boat_registration: wo.boatRegistration || '',
          boat_length: wo.boatLength || '',
          // Financial totals
          total_charges: wo.totalWOCharges || 0,
          total_parts: wo.totalParts || 0,
          total_labor: wo.totalLabor || 0,
          total_freight: wo.totalFreight || 0,
          total_equipment: wo.totalEquipment || 0,
          total_sublet: wo.totalSublet || 0,
          total_mileage: wo.totalMileage || 0,
          total_misc_supply: wo.totalMiscSupply || 0,
          total_bill_codes: wo.totalBillCodes || 0,
          // Cost totals
          total_parts_cost: wo.totalPartsCost || 0,
          total_labor_cost: wo.totalLaborCost || 0,
          total_sublet_cost: wo.totalSubletCost || 0,
          total_freight_cost: wo.totalFreightCost || 0,
          // Forecasted totals
          total_forecasted_parts: wo.totalForecastedParts || 0,
          total_forecasted_labor: wo.totalForecastedLabor || 0,
          total_forecasted_hours: wo.totalForecastedHours || 0,
          // Dates
          est_comp_date: wo.estCompDate || null,
          est_start_date: wo.estStartDate || null,
          promised_date: wo.promisedDate || null,
          last_mod_date: wo.lastModDate || null,
          last_mod_time: wo.lastModTime || null,
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
            // Financial totals
            total_charges: op.totalCharges || 0,
            total_parts: op.totalParts || 0,
            total_labor: op.totalLabor || 0,
            total_labor_hours: op.totalLaborHours || 0,
            total_freight: op.totalFreight || 0,
            total_equipment: op.totalEquipment || 0,
            total_sublet: op.totalSublet || 0,
            total_mileage: op.totalMileage || 0,
            total_misc_supply: op.totalMiscSupply || 0,
            total_bill_codes: op.totalBillCodes || 0,
            labor_billed: op.laborBilled || 0,
            total_to_complete: op.totalToComplete || 0,
            // Descriptions
            long_desc: op.longDesc || '',
            tech_desc: op.techDesc || '',
            manager_comments: op.managerComments || '',
            // Estimated values
            estimated_charges: op.estimatedCharges || 0,
            estimated_parts: op.estimatedParts || 0,
            estimated_labor: op.estimatedLabor || 0,
            estimated_labor_hours: op.estimatedLaborHours || 0,
            estimated_freight: op.estimatedFreight || 0,
            estimated_equipment: op.estimatedEquipment || 0,
            estimated_sublet: op.estimatedSublet || 0,
            estimated_mileage: op.estimatedMileage || 0,
            estimated_misc_supply: op.estimatedMiscSupply || 0,
            estimated_bill_codes: op.estimatedBillCodes || 0,
            // Flat rate billing
            is_opcode_approved: op.isOpcodeApproved || false,
            flat_rate_amount: op.flatRateAmount || 0,
            flat_rate_per_foot_rate: op.flatRatePerFootRate || 0,
            flat_rate_per_foot_method: op.flatRatePerFootMethod || '',
            // Forecasted values
            forecasted_parts_charges: op.forecastedPartsCharges || 0,
            forecasted_labor_charges: op.forecastedLaborCharges || 0,
            forecasted_labor_hours: op.forecastedLaborHours || 0,
            // Dates
            est_start_date: op.estStartDate || null,
            est_complete_date: op.estCompleteDate || null,
            req_comp_date: op.reqCompDate || null,
            standard_hours: op.standardHours || 0,
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

    // ========== STEP 2: Get time entries to track last_worked_at ==========
    const timeEntryUrl = `https://api.dmeapi.com/api/v1/Service/WorkOrders/ListTimeEntry?StartDate=${formatDateForApi(lookbackTime)}&EndDate=${formatDateForApi(now)}&Page=1&PageSize=100&Detail=true`
    console.log('Fetching time entries:', timeEntryUrl)

    const timeEntryResponse = await fetch(timeEntryUrl, {
      method: 'GET',
      headers: dmHeaders,
    })

    if (timeEntryResponse.ok) {
      const timeEntryData = await timeEntryResponse.json()
      const timeEntries = timeEntryData.content || []
      console.log('Time entries found:', timeEntries.length)

      // Time entries from Dockmaster have nested operations array
      // Structure: { workOrderId, operations: [{ opcode, estStartDate, ... }] }
      // We use estStartDate from the operation as the "worked at" timestamp
      const latestWorkTime = new Map<string, { workOrderId: string, opCode: string, timestamp: string }>()

      for (const entry of timeEntries) {
        const workOrderId = String(entry.workOrderId)

        // Each time entry can have multiple operations
        for (const op of (entry.operations || [])) {
          const opCode = op.opcode
          // Use estStartDate as the timestamp (format: "01/26/2026")
          // Convert MM/DD/YYYY to ISO format for storage
          const estStartDate = op.estStartDate
          if (estStartDate && opCode) {
            // Parse MM/DD/YYYY and convert to ISO timestamp
            const [month, day, year] = estStartDate.split('/')
            const isoTimestamp = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00.000Z`

            const key = `${workOrderId}|||${opCode}`
            const existing = latestWorkTime.get(key)
            if (!existing || isoTimestamp > existing.timestamp) {
              latestWorkTime.set(key, {
                workOrderId,
                opCode,
                timestamp: isoTimestamp
              })
            }
          }
        }
      }

      console.log('Unique work order/opcode combinations to update:', latestWorkTime.size)

      // Update operations with last_worked_at timestamp
      for (const [, data] of latestWorkTime) {
        console.log(`Updating operation: WO=${data.workOrderId}, opcode=${data.opCode}, timestamp=${data.timestamp}`)

        // Update the operation's last_worked_at based on time entry timestamp
        const { error: updateError } = await supabase
          .from('work_order_operations')
          .update({
            last_worked_at: data.timestamp,
          })
          .eq('work_order_id', data.workOrderId)
          .eq('opcode', data.opCode)

        if (updateError) {
          console.error(`Failed to update operation: WO=${data.workOrderId}, opcode=${data.opCode}:`, updateError)
        } else {
          timeEntriesProcessed++
        }
      }
    } else {
      console.error('Failed to fetch time entries:', timeEntryResponse.status)
    }

    // Update sync status
    await supabase
      .from('sync_status')
      .upsert({
        id: 'workorders_incremental',
        last_sync: now.toISOString(),
        last_success: now.toISOString(),
        status: 'success',
        records_synced: workOrdersUpdated,
        error_message: null,
        updated_at: now.toISOString(),
      }, { onConflict: 'id' })

    const duration = (Date.now() - startTime) / 1000

    // Show EST time in response for easier debugging
    const lookbackEST = decodeURIComponent(formatDateForApi(lookbackTime))

    return new Response(
      JSON.stringify({
        success: true,
        workOrdersUpdated,
        timeEntriesProcessed,
        lookbackFrom: lookbackEST,
        lookbackFromUTC: lookbackTime.toISOString(),
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
        id: 'workorders_incremental',
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
