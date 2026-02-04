// Supabase Edge Function: cleanup-stale-workorders
// Runs weekly to find work orders not synced in 60+ days and delete them if they no longer exist in Dockmaster
// This prevents stale data from accumulating in the database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STALE_DAYS = 60  // Work orders not updated in this many days are considered stale
const BATCH_SIZE = 100  // How many work orders to check per API call

async function authenticateDockmaster(username: string, password: string) {
  const authResponse = await fetch('https://auth.dmeapi.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserName: username, Password: password }),
  })

  if (!authResponse.ok) {
    throw new Error(`Dockmaster authentication failed: ${authResponse.status}`)
  }

  const authData = await authResponse.json()
  const authToken = authData.authToken
  const systemId = authData.availableConnections?.[0]?.systemId

  if (!authToken || !systemId) {
    throw new Error('Dockmaster authentication response missing token or systemId')
  }

  return { authToken, systemId }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let workOrdersChecked = 0
  let workOrdersDeleted = 0
  let workOrdersKept = 0
  let operationsDeleted = 0
  let timeEntriesDeleted = 0

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

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

    // Calculate cutoff date (60 days ago)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS)
    const cutoffIso = cutoffDate.toISOString()

    console.log(`Looking for work orders not synced since: ${cutoffIso}`)

    // Query stale work orders
    const { data: staleWorkOrders, error: queryError } = await supabase
      .from('work_orders')
      .select('id')
      .lt('last_synced', cutoffIso)
      .order('last_synced', { ascending: true })

    if (queryError) {
      throw new Error(`Failed to query stale work orders: ${queryError.message}`)
    }

    if (!staleWorkOrders || staleWorkOrders.length === 0) {
      console.log('No stale work orders found')

      // Update sync status
      await supabase.from('sync_status').upsert({
        id: 'cleanup_stale_workorders',
        last_sync: new Date().toISOString(),
        last_success: new Date().toISOString(),
        status: 'success',
        error_message: null,
        records_synced: 0,
      })

      return new Response(
        JSON.stringify({
          success: true,
          message: 'No stale work orders found',
          workOrdersChecked: 0,
          workOrdersDeleted: 0,
          duration: `${(Date.now() - startTime) / 1000}s`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${staleWorkOrders.length} stale work orders to check`)

    // Process in batches
    const staleIds = staleWorkOrders.map(wo => String(wo.id))

    for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
      const batchIds = staleIds.slice(i, i + BATCH_SIZE)
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchIds.length} work orders`)

      // Call Dockmaster RetrieveList API to check if they exist
      const retrieveUrl = 'https://api.dmeapi.com/api/v1/Service/WorkOrders/RetrieveList'
      const retrieveResponse = await fetch(retrieveUrl, {
        method: 'POST',
        headers: dmHeaders,
        body: JSON.stringify({
          woIds: batchIds,
          detail: false,  // We don't need details, just checking existence
        }),
      })

      if (!retrieveResponse.ok) {
        console.error(`Failed to retrieve work orders from Dockmaster: ${retrieveResponse.status}`)
        // Skip this batch but continue with others
        continue
      }

      const retrieveData = await retrieveResponse.json()

      // Handle different response formats
      const existingWOs = Array.isArray(retrieveData)
        ? retrieveData
        : (retrieveData?.content || retrieveData?.data || [])

      // Get IDs of work orders that exist in Dockmaster
      const existingIds = new Set(existingWOs.map((wo: any) => String(wo.id)))
      console.log(`  Dockmaster returned ${existingIds.size} existing work orders`)

      // Find IDs that don't exist in Dockmaster
      const idsToDelete = batchIds.filter(id => !existingIds.has(id))
      const idsToKeep = batchIds.filter(id => existingIds.has(id))

      workOrdersChecked += batchIds.length
      workOrdersKept += idsToKeep.length

      if (idsToDelete.length === 0) {
        console.log(`  No work orders to delete in this batch`)
        continue
      }

      console.log(`  Deleting ${idsToDelete.length} work orders that no longer exist in Dockmaster`)

      // Delete related data first (foreign key constraints)

      // 1. Delete work_order_operations
      const { data: deletedOps, error: opsError } = await supabase
        .from('work_order_operations')
        .delete()
        .in('work_order_id', idsToDelete)
        .select('id')

      if (opsError) {
        console.error(`Error deleting operations: ${opsError.message}`)
      } else {
        operationsDeleted += deletedOps?.length || 0
        console.log(`  Deleted ${deletedOps?.length || 0} operations`)
      }

      // 2. Delete time_entries
      const { data: deletedEntries, error: entriesError } = await supabase
        .from('time_entries')
        .delete()
        .in('work_order_id', idsToDelete)
        .select('id')

      if (entriesError) {
        console.error(`Error deleting time entries: ${entriesError.message}`)
      } else {
        timeEntriesDeleted += deletedEntries?.length || 0
        console.log(`  Deleted ${deletedEntries?.length || 0} time entries`)
      }

      // 3. Delete work_orders
      const { data: deletedWOs, error: woError } = await supabase
        .from('work_orders')
        .delete()
        .in('id', idsToDelete)
        .select('id')

      if (woError) {
        console.error(`Error deleting work orders: ${woError.message}`)
      } else {
        workOrdersDeleted += deletedWOs?.length || 0
        console.log(`  Deleted ${deletedWOs?.length || 0} work orders`)
      }
    }

    const duration = (Date.now() - startTime) / 1000

    // Update sync status
    await supabase.from('sync_status').upsert({
      id: 'cleanup_stale_workorders',
      last_sync: new Date().toISOString(),
      last_success: new Date().toISOString(),
      status: 'success',
      error_message: null,
      records_synced: workOrdersDeleted,
    })

    console.log(`Cleanup complete: checked=${workOrdersChecked}, deleted=${workOrdersDeleted}, kept=${workOrdersKept}`)

    return new Response(
      JSON.stringify({
        success: true,
        staleDays: STALE_DAYS,
        workOrdersChecked,
        workOrdersDeleted,
        workOrdersKept,
        operationsDeleted,
        timeEntriesDeleted,
        duration: `${duration.toFixed(1)}s`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Cleanup error:', error)

    // Try to update sync status with error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      await supabase.from('sync_status').upsert({
        id: 'cleanup_stale_workorders',
        last_sync: new Date().toISOString(),
        status: 'error',
        error_message: error.message,
      })
    } catch (e) {
      console.error('Failed to update sync status:', e)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        workOrdersChecked,
        workOrdersDeleted,
        duration: `${(Date.now() - startTime) / 1000}s`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
