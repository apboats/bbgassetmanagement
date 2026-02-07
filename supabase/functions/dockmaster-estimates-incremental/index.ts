// Supabase Edge Function: dockmaster-estimates-incremental
// Incremental sync of estimates from Dockmaster API
// Runs every 2 minutes via cron, checking last 15 minutes of changes
// Stores in work_orders table with is_estimate=true

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const errorText = await authResponse.text()
    console.error('Dockmaster auth failed:', authResponse.status, errorText)
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
  let syncedCount = 0
  let updatedCount = 0

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get last sync time
    const { data: syncStatus } = await supabase
      .from('sync_status')
      .select('last_sync')
      .eq('id', 'estimates_incremental')
      .single()

    // Calculate lookback time - always look back at least 15 minutes
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

    console.log('Estimates incremental sync starting, lookback from (UTC):', lookbackTime.toISOString())
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

    // Step 1: Try ListNewOrChanged for estimates (if endpoint exists)
    // If not available, fall back to RetrieveList
    let estimates: any[] = []

    // Try the ListNewOrChanged endpoint first
    const listChangedUrl = `https://api.dmeapi.com/api/v1/Service/Estimates/ListNewOrChanged?LastUpdate=${formatDateForApi(lookbackTime)}&Page=1&PageSize=100`
    console.log('Trying ListNewOrChanged:', listChangedUrl)

    const changedResponse = await fetch(listChangedUrl, {
      method: 'GET',
      headers: dmHeaders,
    })

    if (changedResponse.ok) {
      const changedData = await changedResponse.json()
      estimates = changedData.content || changedData || []
      console.log(`ListNewOrChanged returned ${estimates.length} changed estimates`)
    } else {
      // Fallback: Use RetrieveList POST to get all open estimates
      console.log('ListNewOrChanged not available (status:', changedResponse.status, '), using RetrieveList fallback')

      const retrieveUrl = 'https://api.dmeapi.com/api/v1/Service/Estimates/RetrieveList'
      const retrieveResponse = await fetch(retrieveUrl, {
        method: 'POST',
        headers: dmHeaders,
        body: JSON.stringify({
          status: 'O',  // Open estimates
          detail: true,
          Page: 1,
          PageSize: 100,
        }),
      })

      if (!retrieveResponse.ok) {
        const errorText = await retrieveResponse.text()
        throw new Error(`Failed to fetch estimates: ${retrieveResponse.status} - ${errorText}`)
      }

      const retrieveData = await retrieveResponse.json()
      estimates = Array.isArray(retrieveData)
        ? retrieveData
        : (retrieveData?.content || retrieveData?.data || [])

      console.log(`RetrieveList returned ${estimates.length} estimates`)
    }

    // Log first estimate to see structure
    if (estimates.length > 0) {
      console.log('Sample estimate id:', estimates[0].id)
      console.log('Sample estimate riggingId:', estimates[0].riggingId)
      console.log('Sample estimate object:', JSON.stringify(estimates[0]).substring(0, 500))
    }

    // Process estimates
    for (const est of estimates) {
      // Only process records that have rigging_id (for matching to inventory boats)
      if (!est.riggingId) {
        console.log(`Skipping estimate ${est.id}: no riggingId`)
        continue
      }

      console.log(`Processing estimate ${est.id}: riggingId=${est.riggingId}, title="${est.title}"`)

      const estimateData = {
        id: est.id,
        customer_id: est.customerId || est.customerID || null,
        customer_name: est.customerName || '',
        clerk_id: est.clerkId || null,
        rigging_id: est.riggingId,
        rigging_type: est.riggingType || null,
        is_internal: true,
        is_estimate: true,  // Key flag!
        type: est.type || null,
        tax_schema: est.taxSchema || null,
        location_code: est.locationCode || null,
        status: est.status,
        title: est.title,
        category: est.category,
        creation_date: est.creationDate,
        // Boat details
        boat_name: est.boatName || '',
        boat_year: est.boatYear || '',
        boat_make: est.boatMake || '',
        boat_model: est.boatModel || '',
        boat_serial_number: est.boatSerialNumber || '',
        boat_registration: est.boatRegistration || '',
        boat_length: est.boatLength || '',
        // Financial totals
        total_charges: est.totalWOCharges || 0,
        total_parts: est.totalParts || 0,
        total_labor: est.totalLabor || 0,
        total_freight: est.totalFreight || 0,
        total_equipment: est.totalEquipment || 0,
        total_sublet: est.totalSublet || 0,
        total_mileage: est.totalMileage || 0,
        total_misc_supply: est.totalMiscSupply || 0,
        total_bill_codes: est.totalBillCodes || 0,
        // Cost totals
        total_parts_cost: est.totalPartsCost || 0,
        total_labor_cost: est.totalLaborCost || 0,
        total_sublet_cost: est.totalSubletCost || 0,
        total_freight_cost: est.totalFreightCost || 0,
        // Forecasted totals
        total_forecasted_parts: est.totalForecastedParts || 0,
        total_forecasted_labor: est.totalForecastedLabor || 0,
        total_forecasted_hours: est.totalForecastedHours || 0,
        // Dates
        est_comp_date: est.estCompDate || null,
        est_start_date: est.estStartDate || null,
        promised_date: est.promisedDate || null,
        last_mod_date: est.lastModDate || null,
        last_mod_time: est.lastModTime || null,
        comments: est.comments || '',
        last_synced: new Date().toISOString(),
      }

      // Check if this estimate already exists
      const { data: existing } = await supabase
        .from('work_orders')
        .select('id')
        .eq('id', est.id)
        .single()

      // Upsert estimate
      const { error: saveError } = await supabase
        .from('work_orders')
        .upsert(estimateData, { onConflict: 'id' })

      if (saveError) {
        console.error('Error saving estimate:', est.id, saveError)
        console.error('Estimate data was:', JSON.stringify(estimateData))
        continue
      }

      if (existing) {
        updatedCount++
      } else {
        syncedCount++
      }

      // Save operations (estimate line items)
      if (est.operations && est.operations.length > 0) {
        // Delete old operations
        await supabase
          .from('work_order_operations')
          .delete()
          .eq('work_order_id', est.id)

        const operations = est.operations.map((op: any) => ({
          id: op.id,
          work_order_id: est.id,
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

        const { error: opsError } = await supabase
          .from('work_order_operations')
          .insert(operations)

        if (opsError) {
          console.error('Error saving operations for estimate:', est.id, opsError)
        }
      }
    }

    // Update sync status
    await supabase
      .from('sync_status')
      .upsert({
        id: 'estimates_incremental',
        last_sync: now.toISOString(),
        last_success: now.toISOString(),
        status: 'success',
        records_synced: syncedCount + updatedCount,
        error_message: null,
        updated_at: now.toISOString(),
      }, { onConflict: 'id' })

    const duration = (Date.now() - startTime) / 1000

    // Show EST time in response for easier debugging
    const lookbackEST = decodeURIComponent(formatDateForApi(lookbackTime))

    return new Response(
      JSON.stringify({
        success: true,
        newEstimates: syncedCount,
        updatedEstimates: updatedCount,
        total: estimates.length,
        lookbackFrom: lookbackEST,
        lookbackFromUTC: lookbackTime.toISOString(),
        duration: `${duration.toFixed(1)}s`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Estimates sync error:', error)

    // Update sync status to error
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    await supabase
      .from('sync_status')
      .upsert({
        id: 'estimates_incremental',
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
