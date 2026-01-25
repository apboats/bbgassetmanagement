// Supabase Edge Function: dockmaster-workorders
// Fetches work orders from Dockmaster API and caches them in the database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Authenticate with Dockmaster API and get bearer token
async function authenticateDockmaster(username: string, password: string) {
  const authResponse = await fetch('https://auth.dmeapi.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      UserName: username,
      Password: password,
    }),
  })

  if (!authResponse.ok) {
    const errorText = await authResponse.text()
    console.error('Dockmaster auth failed:', authResponse.status, errorText)
    throw new Error(`Authentication failed: ${authResponse.status}`)
  }

  const authData = await authResponse.json()
  
  // Extract the token and system ID
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

  try {
    const { customerId, boatId, boatUuid, refresh } = await req.json()

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // If not refreshing, try to get cached data first
    if (!refresh && boatUuid) {
      const { data: cachedWorkOrders, error: cacheError } = await supabase
        .from('work_orders')
        .select(`
          *,
          operations:work_order_operations(*)
        `)
        .eq('boat_id', boatUuid)
        .eq('status', 'O')

      if (!cacheError && cachedWorkOrders && cachedWorkOrders.length > 0) {
        console.log('Returning cached work orders:', cachedWorkOrders.length)
        return new Response(
          JSON.stringify({ 
            workOrders: cachedWorkOrders,
            fromCache: true,
            lastSynced: cachedWorkOrders[0]?.last_synced
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Need to fetch from Dockmaster
    if (!customerId) {
      return new Response(
        JSON.stringify({ error: 'Customer ID is required to fetch work orders' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Dockmaster credentials from database
    const { data: config, error: configError } = await supabase
      .from('dockmaster_config')
      .select('username, password')
      .limit(1)
      .single()

    if (configError || !config || !config.username || !config.password) {
      console.error('Config error:', configError)
      return new Response(
        JSON.stringify({ error: 'Dockmaster credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Authenticate with Dockmaster to get token
    console.log('Authenticating with Dockmaster...')
    const { authToken, systemId } = await authenticateDockmaster(config.username, config.password)
    console.log('Authentication successful, systemId:', systemId)

    // Dockmaster API headers
    const dmHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'X-DM_SYSTEM_ID': systemId,
    }

    // Step 1: Get list of open work orders for customer
    const listUrl = `https://api.dmeapi.com/api/v1/Service/WorkOrders/ListForCustomer?CustId=${customerId}&Status=O`
    console.log('Fetching work orders list:', listUrl)

    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: dmHeaders,
    })

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      console.error('List work orders error:', listResponse.status, errorText)
      return new Response(
        JSON.stringify({ error: `Failed to fetch work orders: ${listResponse.status}` }),
        { status: listResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const workOrdersList = await listResponse.json()
    console.log('Work orders list count:', workOrdersList?.length)
    console.log('Looking for boatId:', boatId)

    // Note: ListForCustomer doesn't return boat ID, so we get all and filter after detail fetch
    let workOrdersToFetch = workOrdersList || []

    if (workOrdersToFetch.length === 0) {
      // Clear any old cached work orders for this boat
      if (boatUuid) {
        await supabase
          .from('work_orders')
          .delete()
          .eq('boat_id', boatUuid)
      }
      
      return new Response(
        JSON.stringify({ workOrders: [], fromCache: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Get all work order IDs for batch retrieval
    const woIds = workOrdersToFetch.map((wo: any) => wo.id)
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
      console.error('Failed to retrieve work order details:', retrieveResponse.status, errorText)
      return new Response(
        JSON.stringify({ error: `Failed to retrieve work order details: ${retrieveResponse.status}` }),
        { status: retrieveResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retrieveData = await retrieveResponse.json()

    // Handle different response structures - might be array directly or wrapped in content/data
    const workOrdersWithDetails = Array.isArray(retrieveData)
      ? retrieveData
      : (retrieveData?.content || retrieveData?.data || retrieveData)

    console.log(`Retrieved ${workOrdersWithDetails?.length || 0} work orders with details`)

    // Filter by boatId and transform the data
    const detailedWorkOrders = (workOrdersWithDetails || []).map((detail: any) => {
      // Get the boat ID from the detail response
      const detailBoatId = String(detail.boatId || '').trim()
      console.log(`WO ${detail.id} detail - boatId: "${detailBoatId}", looking for: "${boatId}"`)

      // Filter: only return work orders for the specific boat we're looking for
      if (boatId) {
        const targetBoatId = String(boatId).trim()
        if (detailBoatId !== targetBoatId) {
          console.log(`Skipping WO ${detail.id} - boat "${detailBoatId}" doesn't match "${targetBoatId}"`)
          return null
        }
        console.log(`WO ${detail.id} matches boat ${targetBoatId}`)
      }

      return {
        id: detail.id,
        customer_id: customerId,
        customer_name: detail.customerName || '',
        clerk_id: detail.clerkId || null,
        boat_id: boatUuid,
        rigging_id: detail.riggingId || null,
        rigging_type: detail.riggingType || null,
        is_internal: false,
        type: detail.type || null,
        tax_schema: detail.taxSchema || null,
        location_code: detail.locationCode || null,
        is_estimate: detail.isEstimate || false,
        creation_date: detail.creationDate,
        category: detail.category,
        status: detail.status,
        title: detail.title,
        // Boat details
        boat_name: detail.boatName || '',
        boat_year: detail.boatYear || '',
        boat_make: detail.boatMake || '',
        boat_model: detail.boatModel || '',
        boat_serial_number: detail.boatSerialNumber || '',
        boat_registration: detail.boatRegistration || '',
        boat_length: detail.boatLength || '',
        // Financial totals
        total_charges: detail.totalWOCharges || 0,
        total_parts: detail.totalParts || 0,
        total_labor: detail.totalLabor || 0,
        total_freight: detail.totalFreight || 0,
        total_equipment: detail.totalEquipment || 0,
        total_sublet: detail.totalSublet || 0,
        total_mileage: detail.totalMileage || 0,
        total_misc_supply: detail.totalMiscSupply || 0,
        total_bill_codes: detail.totalBillCodes || 0,
        // Cost totals
        total_parts_cost: detail.totalPartsCost || 0,
        total_labor_cost: detail.totalLaborCost || 0,
        total_sublet_cost: detail.totalSubletCost || 0,
        total_freight_cost: detail.totalFreightCost || 0,
        // Forecasted totals
        total_forecasted_parts: detail.totalForecastedParts || 0,
        total_forecasted_labor: detail.totalForecastedLabor || 0,
        total_forecasted_hours: detail.totalForecastedHours || 0,
        // Dates
        est_comp_date: detail.estCompDate || null,
        est_start_date: detail.estStartDate || null,
        promised_date: detail.promisedDate || null,
        last_mod_date: detail.lastModDate || null,
        last_mod_time: detail.lastModTime || null,
        comments: detail.comments || '',
        last_synced: new Date().toISOString(),
        operations: (detail.operations || []).map((op: any) => ({
          id: op.id,
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
        })),
      }
    })

    // Filter out non-matching boats (nulls from boatId filter)
    const validWorkOrders = detailedWorkOrders.filter((wo: any) => wo !== null)
    console.log(`Valid work orders after filtering: ${validWorkOrders.length}`)

    // Step 3: Save to database (upsert work orders, replace operations)
    if (boatUuid && validWorkOrders.length > 0) {
      for (const wo of validWorkOrders) {
        const { operations, ...workOrderData } = wo
        
        // Upsert work order
        const { error: woError } = await supabase
          .from('work_orders')
          .upsert(workOrderData, { onConflict: 'id' })
        
        if (woError) {
          console.error('Error saving work order:', woError)
          continue
        }

        // Delete old operations and insert new ones
        await supabase
          .from('work_order_operations')
          .delete()
          .eq('work_order_id', wo.id)

        if (operations && operations.length > 0) {
          const opsWithWoId = operations.map((op: any) => ({
            ...op,
            work_order_id: wo.id,
          }))
          
          const { error: opsError } = await supabase
            .from('work_order_operations')
            .insert(opsWithWoId)
          
          if (opsError) {
            console.error('Error saving operations:', opsError)
          }
        }
      }

      // Clean up any work orders that are no longer open
      const validIds = validWorkOrders.map(wo => wo.id)
      await supabase
        .from('work_orders')
        .delete()
        .eq('boat_id', boatUuid)
        .not('id', 'in', `(${validIds.join(',')})`)

      // Step 4: Update the boat's work_order_number field with the work order IDs
      const workOrderNumbers = validWorkOrders.map(wo => wo.id).join(', ')
      console.log('Updating boat work_order_number to:', workOrderNumbers)
      
      const { error: boatUpdateError } = await supabase
        .from('boats')
        .update({ work_order_number: workOrderNumbers })
        .eq('id', boatUuid)
      
      if (boatUpdateError) {
        console.error('Error updating boat work_order_number:', boatUpdateError)
      }
    }

    // Return the work orders with operations nested
    const responseData = validWorkOrders.map(wo => ({
      ...wo,
      // Convert snake_case back to what UI expects
      creationDate: wo.creation_date,
      totalCharges: wo.total_charges,
      lastSynced: wo.last_synced,
      operations: wo.operations.map((op: any) => ({
        opcode: op.opcode,
        opcodeDesc: op.opcode_desc,
        status: op.status,
        type: op.type,
        flagLaborFinished: op.flag_labor_finished,
        totalCharges: op.total_charges,
      })),
    }))

    return new Response(
      JSON.stringify({ 
        workOrders: responseData, 
        fromCache: false,
        lastSynced: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
