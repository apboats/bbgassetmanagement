// Supabase Edge Function: dockmaster-workorders-backfill
// One-time backfill of historical work orders using ListNewOrChanged API
// Run manually to populate historical data from Jan 1, 2025

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Internal customer ID for BBG dealership
const INTERNAL_CUSTOMER_ID = '3112'

// Backfill start date - Jan 1, 2025
const BACKFILL_START_DATE = new Date('2025-01-01T00:00:00.000')

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
  let totalProcessed = 0
  let totalPages = 0

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Starting backfill from:', BACKFILL_START_DATE.toISOString())
    console.log('Backfill date in EST:', decodeURIComponent(formatDateForApi(BACKFILL_START_DATE)))

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
    console.log('Authenticating with Dockmaster...')
    const { authToken, systemId } = await authenticateDockmaster(config.username, config.password)
    console.log('Authentication successful')

    const dmHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'X-DM_SYSTEM_ID': systemId,
    }

    // Process all pages
    let currentPage = 1
    let hasMorePages = true

    while (hasMorePages) {
      const url = `https://api.dmeapi.com/api/v1/Service/WorkOrders/ListNewOrChanged?LastUpdate=${formatDateForApi(BACKFILL_START_DATE)}&Page=${currentPage}&PageSize=100`
      console.log(`Fetching page ${currentPage}:`, url)

      const response = await fetch(url, {
        method: 'GET',
        headers: dmHeaders,
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch page ${currentPage}: ${response.status}`)
      }

      const data = await response.json()
      const workOrders = data.content || []
      const maxPages = data.maxPages || 1

      console.log(`Page ${currentPage}/${maxPages}: ${workOrders.length} work orders`)

      // Process each work order
      for (const wo of workOrders) {
        // Determine if this is internal (has rigging_id) or customer work order
        const isInternal = !!wo.riggingId || wo.customerID === INTERNAL_CUSTOMER_ID

        // Determine dockmaster_boat_id - only use boatId when rigging_id is null
        const dockmasterBoatId = wo.riggingId ? null : (wo.boatId || null)

        // For customer work orders, try to find matching boat UUID
        let boatUuid = null
        if (!isInternal && dockmasterBoatId) {
          const { data: matchingBoat } = await supabase
            .from('boats')
            .select('id')
            .eq('dockmaster_id', dockmasterBoatId)
            .single()
          boatUuid = matchingBoat?.id || null
        }

        const workOrderData = {
          id: wo.id,
          customer_id: wo.customerID,
          customer_name: wo.customerName || '',
          clerk_id: wo.clerkId || null,
          dockmaster_boat_id: dockmasterBoatId,
          boat_id: boatUuid,
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

        // Update operations if present
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
            total_freight: op.totalFreight || 0,
            total_equipment: op.totalEquipment || 0,
            total_sublet: op.totalSublet || 0,
            total_mileage: op.totalMileage || 0,
            total_misc_supply: op.totalMiscSupply || 0,
            total_bill_codes: op.totalBillCodes || 0,
            labor_billed: op.laborBilled || 0,
            total_to_complete: op.totalToComplete || 0,
            long_desc: op.longDesc || '',
            tech_desc: op.techDesc || '',
            manager_comments: op.managerComments || '',
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
            is_opcode_approved: op.isOpcodeApproved || false,
            flat_rate_amount: op.flatRateAmount || 0,
            flat_rate_per_foot_rate: op.flatRatePerFootRate || 0,
            flat_rate_per_foot_method: op.flatRatePerFootMethod || '',
            forecasted_parts_charges: op.forecastedPartsCharges || 0,
            forecasted_labor_charges: op.forecastedLaborCharges || 0,
            forecasted_labor_hours: op.forecastedLaborHours || 0,
            est_start_date: op.estStartDate || null,
            est_complete_date: op.estCompleteDate || null,
            req_comp_date: op.reqCompDate || null,
            standard_hours: op.standardHours || 0,
          }))

          await supabase
            .from('work_order_operations')
            .insert(opsWithWoId)
        }

        totalProcessed++
      }

      totalPages = maxPages
      hasMorePages = currentPage < maxPages
      currentPage++

      // Brief pause between pages to avoid rate limiting
      if (hasMorePages) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    const duration = (Date.now() - startTime) / 1000

    return new Response(
      JSON.stringify({
        success: true,
        totalProcessed,
        totalPages,
        backfillFrom: BACKFILL_START_DATE.toISOString(),
        duration: `${duration.toFixed(1)}s`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Backfill error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        totalProcessed,
        duration: `${(Date.now() - startTime) / 1000}s`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
