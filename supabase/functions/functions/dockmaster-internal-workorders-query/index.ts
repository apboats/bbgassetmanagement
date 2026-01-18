// Supabase Edge Function: dockmaster-internal-workorders-query
// Fast query for work orders by rigging ID (matches inventory boat's dockmaster_id)
// Used by InventoryBoatDetailsModal to display work orders

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { dockmasterId, includeAll } = await req.json()

    if (!dockmasterId) {
      return new Response(
        JSON.stringify({ error: 'dockmasterId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Query work orders by rigging_id (which matches the inventory boat's dockmaster_id)
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        operations:work_order_operations(*)
      `)
      .eq('rigging_id', dockmasterId)
      .eq('is_internal', true)

    // By default, only return open work orders
    if (!includeAll) {
      query = query.eq('status', 'O')
    }

    // Order by creation date descending (newest first)
    query = query.order('creation_date', { ascending: false })

    const { data: workOrders, error } = await query

    if (error) {
      console.error('Query error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to query work orders', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get sync status for last synced time
    const { data: syncStatus } = await supabase
      .from('sync_status')
      .select('last_sync, status')
      .eq('id', 'internal_workorders')
      .single()

    // Transform the data for frontend consumption
    const transformedWorkOrders = (workOrders || []).map((wo: any) => ({
      id: wo.id,
      customerId: wo.customer_id,
      riggingId: wo.rigging_id,
      riggingType: wo.rigging_type,
      creationDate: wo.creation_date,
      category: wo.category,
      status: wo.status,
      title: wo.title,
      boatName: wo.boat_name,
      boatYear: wo.boat_year,
      boatMake: wo.boat_make,
      boatModel: wo.boat_model,
      boatSerialNumber: wo.boat_serial_number,
      totalCharges: wo.total_charges,
      totalParts: wo.total_parts,
      totalLabor: wo.total_labor,
      totalLaborHours: wo.total_labor_hours,
      estCompDate: wo.est_comp_date,
      promisedDate: wo.promised_date,
      comments: wo.comments,
      lastSynced: wo.last_synced,
      operations: (wo.operations || []).map((op: any) => ({
        id: op.id,
        opcode: op.opcode,
        opcodeDesc: op.opcode_desc,
        status: op.status,
        type: op.type,
        category: op.category,
        flagLaborFinished: op.flag_labor_finished,
        totalCharges: op.total_charges,
        totalParts: op.total_parts,
        totalLabor: op.total_labor,
        totalLaborHours: op.total_labor_hours,
        laborBilled: op.labor_billed,
        totalToComplete: op.total_to_complete,
        longDesc: op.long_desc,
        techDesc: op.tech_desc,
        estStartDate: op.est_start_date,
        estCompleteDate: op.est_complete_date,
      })),
    }))

    return new Response(
      JSON.stringify({
        workOrders: transformedWorkOrders,
        count: transformedWorkOrders.length,
        lastSynced: syncStatus?.last_sync || null,
        syncStatus: syncStatus?.status || 'unknown',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Query function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
