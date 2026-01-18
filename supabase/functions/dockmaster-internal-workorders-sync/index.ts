// Supabase Edge Function: dockmaster-internal-workorders-sync
// Full sync of all internal (CustId 3112) work orders from Dockmaster API
// Used for manual "Sync All Rigging WOs" button on Inventory page

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Internal customer ID for BBG dealership
const INTERNAL_CUSTOMER_ID = '3112'

// Rate limiting settings
const BATCH_SIZE = 10 // Concurrent requests per batch
const BATCH_DELAY_MS = 500 // Delay between batches

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

// Process a batch of work orders with rate limiting
async function processBatch(
  workOrders: any[],
  dmHeaders: Record<string, string>,
  startIndex: number
): Promise<any[]> {
  const results = await Promise.all(
    workOrders.map(async (wo: any) => {
      const detailUrl = `https://api.dmeapi.com/api/v1/Service/WorkOrders/Retrieve?Id=${wo.id}&Detail=true`

      try {
        const detailResponse = await fetch(detailUrl, {
          method: 'GET',
          headers: dmHeaders,
        })

        if (!detailResponse.ok) {
          console.error(`Failed to fetch detail for WO ${wo.id}:`, detailResponse.status)
          return null
        }

        const detail = await detailResponse.json()

        return {
          id: detail.id,
          customer_id: INTERNAL_CUSTOMER_ID,
          boat_id: null, // Internal WOs don't link to boats table directly
          rigging_id: detail.riggingId || null,
          rigging_type: detail.riggingType || null,
          is_internal: true,
          creation_date: detail.creationDate,
          category: detail.category,
          status: detail.status,
          title: detail.title,
          boat_name: detail.boatName || '',
          boat_year: detail.boatYear || '',
          boat_make: detail.boatMake || '',
          boat_model: detail.boatModel || '',
          boat_serial_number: detail.boatSerialNumber || '',
          total_charges: detail.totalWOCharges || 0,
          total_parts: detail.totalParts || 0,
          total_labor: detail.totalLabor || 0,
          total_labor_hours: detail.totalLaborHours || 0,
          est_comp_date: detail.estCompDate || null,
          promised_date: detail.promisedDate || null,
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
          })),
        }
      } catch (err) {
        console.error(`Error fetching detail for WO ${wo.id}:`, err)
        return null
      }
    })
  )

  return results.filter(r => r !== null)
}

// Sleep helper for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let syncedCount = 0
  let errorCount = 0

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

    // Step 1: Get list of all open work orders for internal customer
    const listUrl = `https://api.dmeapi.com/api/v1/Service/WorkOrders/ListForCustomer?CustId=${INTERNAL_CUSTOMER_ID}&Status=O`
    console.log('Fetching work orders list for CustId:', INTERNAL_CUSTOMER_ID)

    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: dmHeaders,
    })

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      throw new Error(`Failed to fetch work orders: ${listResponse.status} - ${errorText}`)
    }

    const workOrdersList = await listResponse.json()
    const totalCount = workOrdersList?.length || 0
    console.log('Total open work orders to sync:', totalCount)

    if (totalCount === 0) {
      // Update sync status
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
          errors: 0,
          total: 0,
          duration: `${(Date.now() - startTime) / 1000}s`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Process work orders in batches with rate limiting
    const allWorkOrders: any[] = []

    for (let i = 0; i < totalCount; i += BATCH_SIZE) {
      const batch = workOrdersList.slice(i, i + BATCH_SIZE)
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(totalCount / BATCH_SIZE)} (WOs ${i + 1}-${Math.min(i + BATCH_SIZE, totalCount)})`)

      const batchResults = await processBatch(batch, dmHeaders, i)
      allWorkOrders.push(...batchResults)

      syncedCount += batchResults.length
      errorCount += batch.length - batchResults.length

      // Rate limiting delay between batches
      if (i + BATCH_SIZE < totalCount) {
        await sleep(BATCH_DELAY_MS)
      }
    }

    console.log(`Fetched ${allWorkOrders.length} work orders with details`)

    // Step 3: Save to database
    // First, delete all existing internal work orders (clean slate approach for full sync)
    const { error: deleteError } = await supabase
      .from('work_orders')
      .delete()
      .eq('is_internal', true)

    if (deleteError) {
      console.error('Error deleting old internal work orders:', deleteError)
    }

    // Insert/upsert work orders
    for (const wo of allWorkOrders) {
      const { operations, ...workOrderData } = wo

      // Upsert work order
      const { error: woError } = await supabase
        .from('work_orders')
        .upsert(workOrderData, { onConflict: 'id' })

      if (woError) {
        console.error('Error saving work order:', wo.id, woError)
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
          console.error('Error saving operations for WO:', wo.id, opsError)
        }
      }
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
        errors: errorCount,
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
        errors: errorCount,
        duration: `${(Date.now() - startTime) / 1000}s`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
