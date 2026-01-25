// Supabase Edge Function: dockmaster-internal-workorders-sync
// Full sync of all internal work orders (CustId=3112)
// Used for manual "Sync Rigging WOs" button on Inventory page

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Internal customer ID for BBG dealership
const INTERNAL_CUSTOMER_ID = '3112'

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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let syncedCount = 0

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Update sync status to "in_progress"
    await supabase
      .from('sync_status')
      .upsert({
        id: 'internal_workorders',
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    // Get Dockmaster credentials from database
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

    // Step 1: Get list of open work orders for internal customer (3112)
    const listUrl = `https://api.dmeapi.com/api/v1/Service/WorkOrders/ListForCustomer?CustId=${INTERNAL_CUSTOMER_ID}&Status=O`
    console.log('Fetching work orders list:', listUrl)

    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: dmHeaders,
    })

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      throw new Error(`Failed to fetch work orders list: ${listResponse.status} - ${errorText}`)
    }

    const workOrdersList = await listResponse.json()
    const totalCount = workOrdersList?.length || 0
    console.log(`Total open work orders for CustId ${INTERNAL_CUSTOMER_ID}: ${totalCount}`)

    if (totalCount === 0) {
      // No work orders - update sync status and return
      await supabase
        .from('sync_status')
        .upsert({
          id: 'internal_workorders',
          last_sync: new Date().toISOString(),
          last_success: new Date().toISOString(),
          status: 'success',
          records_synced: 0,
          error_message: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })

      return new Response(
        JSON.stringify({
          success: true,
          synced: 0,
          total: 0,
          duration: `${(Date.now() - startTime) / 1000}s`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Get all work order IDs for batch retrieval
    const woIds = workOrdersList.map((wo: any) => wo.id)
    console.log(`Fetching details for ${woIds.length} work orders via batch POST...`)

    // Step 3: Batch retrieve all work order details with one POST call
    const retrieveUrl = 'https://api.dmeapi.com/api/v1/Service/WorkOrders/RetrieveList'
    const retrieveResponse = await fetch(retrieveUrl, {
      method: 'POST',
      headers: dmHeaders,
      body: JSON.stringify({
        woIds: woIds,
        detail: true,
      }),
    })

    if (!retrieveResponse.ok) {
      const errorText = await retrieveResponse.text()
      throw new Error(`Failed to retrieve work order details: ${retrieveResponse.status} - ${errorText}`)
    }

    const retrieveData = await retrieveResponse.json()
    console.log('RetrieveList response type:', typeof retrieveData)
    console.log('RetrieveList response keys:', JSON.stringify(Object.keys(retrieveData || {})))

    // Handle different response structures - might be array directly or wrapped in content/data
    const workOrdersWithDetails = Array.isArray(retrieveData)
      ? retrieveData
      : (retrieveData?.content || retrieveData?.data || retrieveData)

    console.log(`Retrieved ${workOrdersWithDetails?.length || 0} work orders with details`)

    // Log first work order to see actual values
    if (workOrdersWithDetails?.length > 0) {
      const sample = workOrdersWithDetails[0]
      console.log('Sample WO id:', sample.id)
      console.log('Sample WO riggingId value:', sample.riggingId)
      console.log('Sample WO full object:', JSON.stringify(sample).substring(0, 500))
    }

    // Delete all existing internal work orders (clean slate approach for full sync)
    const { error: deleteError } = await supabase
      .from('work_orders')
      .delete()
      .eq('is_internal', true)

    if (deleteError) {
      console.error('Error deleting old internal work orders:', deleteError)
    }

    // Transform and save all work orders
    for (const wo of (workOrdersWithDetails || [])) {
      // Log rigging_id being saved
      console.log(`WO ${wo.id}: riggingId from API = "${wo.riggingId}", riggingType = "${wo.riggingType}"`)

      const workOrderData = {
        id: wo.id,
        customer_id: INTERNAL_CUSTOMER_ID,
        customer_name: wo.customerName || '',
        clerk_id: wo.clerkId || null,
        boat_id: null,
        rigging_id: wo.riggingId || null,
        rigging_type: wo.riggingType || null,
        is_internal: true,
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
        console.error('Error saving work order:', wo.id, woError)
        console.error('Work order data was:', JSON.stringify(workOrderData))
        continue
      }

      // Delete old operations and insert new ones
      await supabase
        .from('work_order_operations')
        .delete()
        .eq('work_order_id', wo.id)

      if (wo.operations && wo.operations.length > 0) {
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

        const { error: opsError } = await supabase
          .from('work_order_operations')
          .insert(opsWithWoId)

        if (opsError) {
          console.error('Error saving operations for WO:', wo.id, opsError)
        }
      }

      syncedCount++
    }

    // Update sync status to success
    await supabase
      .from('sync_status')
      .upsert({
        id: 'internal_workorders',
        last_sync: new Date().toISOString(),
        last_success: new Date().toISOString(),
        status: 'success',
        records_synced: syncedCount,
        error_message: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    const duration = (Date.now() - startTime) / 1000

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        total: totalCount,
        duration: `${duration.toFixed(1)}s`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Full sync error:', error)

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
        synced: syncedCount,
        duration: `${(Date.now() - startTime) / 1000}s`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
