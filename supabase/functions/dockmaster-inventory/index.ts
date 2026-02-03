// Supabase Edge Function: Dockmaster Inventory Sync Proxy
// This proxies requests to the Dockmaster API to sync inventory boats

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Valid sales status codes - exclude SD (Sold Delivered)
const VALID_SALES_STATUSES = ['HA', 'HS', 'OA', 'OS', 'FA', 'FS', 'S', 'R', 'FP']

// Map full text status to codes (in case API returns full text)
const STATUS_TEXT_TO_CODE: Record<string, string> = {
  'On Hand Available': 'HA',
  'On Hand Sold': 'HS',
  'On Order Available': 'OA',
  'On Order Sold': 'OS',
  'Future Available': 'FA',
  'Future Sold': 'FS',
  'Sold': 'S',
  'Reserved': 'R',
  'Floor Planned': 'FP',
  'Sold Delivered': 'SD',
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
    // Check if this is a full sync (manual) or incremental (auto)
    let fullSync = false
    try {
      const body = await req.json()
      fullSync = body?.fullSync === true
    } catch {
      // No body or invalid JSON, default to incremental
    }

    // Get Dockmaster credentials from database
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: config } = await supabaseClient
      .from('dockmaster_config')
      .select('username, password')
      .limit(1)
      .single()

    if (!config || !config.username || !config.password) {
      return new Response(
        JSON.stringify({ error: 'Dockmaster credentials not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Authenticate with Dockmaster to get token
    console.log('Authenticating with Dockmaster for inventory sync...')
    const { authToken, systemId } = await authenticateDockmaster(config.username, config.password)
    console.log('Authentication successful, systemId:', systemId)

    // Call Dockmaster API to retrieve BOAT inventory only
    const url = 'https://api.dmeapi.com/api/v1/UnitSales/RetrieveBoatInventory'

    // Determine date filter based on sync type
    let lastModifiedDate: string
    if (fullSync) {
      // Full sync (manual) - go back 3 years
      const threeYearsAgo = new Date()
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
      lastModifiedDate = threeYearsAgo.toISOString().split('T')[0]
      console.log('Full sync requested - fetching boats since:', lastModifiedDate)
    } else {
      // Incremental sync (auto) - only today's changes
      lastModifiedDate = new Date().toISOString().split('T')[0]
      console.log('Incremental sync - fetching boats modified since:', lastModifiedDate)
    }

    // Fetch each status separately since API may not support multiple statuses
    const statusesToFetch = ['HA', 'HS', 'OA', 'OS', 'FA', 'FS', 'S', 'R', 'FP']
    let allRawBoats: any[] = []

    for (const status of statusesToFetch) {
      try {
        console.log(`Fetching boats with status: ${status}`)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'X-DM_SYSTEM_ID': systemId,
          },
          body: JSON.stringify({
            lastModifiedDate: lastModifiedDate,
            status: status
          }),
        })

        if (!response.ok) {
          console.error(`Error fetching status ${status}:`, response.status)
          continue // Skip this status but continue with others
        }

        const statusData = await response.json()
        console.log(`Status ${status}: received ${statusData?.length || 0} boats`)
        
        if (statusData && Array.isArray(statusData)) {
          allRawBoats = allRawBoats.concat(statusData)
        }
      } catch (err) {
        console.error(`Exception fetching status ${status}:`, err)
        continue
      }
    }

    const rawData = allRawBoats
    console.log(`Total received: ${rawData.length} boats from Dockmaster`)

    // Log unique status values to debug
    const uniqueStatuses = [...new Set((rawData || []).map((item: any) => item.status))]
    console.log('Unique status values from API:', uniqueStatuses)

    // Filter by valid sales status codes (exclude SD - Sold Delivered)
    const filteredBoats = (rawData || []).filter((item: any) => {
      const rawStatus = item.status || ''
      // Check if it's a code or full text, normalize to code
      const statusCode = STATUS_TEXT_TO_CODE[rawStatus] || rawStatus
      return VALID_SALES_STATUSES.includes(statusCode)
    })

    console.log(`Filtered to ${filteredBoats.length} boats with valid status`)

    // Transform to our format - import ALL fields from API
    const transformedBoats = filteredBoats.map((item: any) => {
      const rawStatus = item.status || ''
      // Normalize status to code
      const statusCode = STATUS_TEXT_TO_CODE[rawStatus] || rawStatus

      // Combine packaged and bundled motors into one array
      const allMotors = [
        ...(item.packagesMotors || []),
        ...(item.bundledMotors || [])
      ].map((motor: any) => ({
        id: motor.id,
        serialNumber: motor.serialNumber,
        description: motor.description,
        color: motor.color,
        vendorName: motor.motorModelInfo?.vendorName || '',
        modelNumber: motor.motorModelInfo?.modelNumber || '',
        year: motor.motorModelInfo?.year || '',
        horsePower: motor.motorModelInfo?.horsePowerRating || '',
        shaftLength: motor.motorModelInfo?.shaftLength || '',
        powerType: motor.motorModelInfo?.powerType || '',
        strokes: motor.motorModelInfo?.strokes || '',
      }))

      // Combine packaged and bundled trailers into one array
      const allTrailers = [
        ...(item.packagedTrailers || []),
        ...(item.bundledTrailers || [])
      ].map((trailer: any) => ({
        id: trailer.id,
        serialNumber: trailer.serialNumber,
        description: trailer.description,
        vendorName: trailer.trailerModelInfo?.vendorName || '',
        modelNumber: trailer.trailerModelInfo?.modelNumber || '',
        year: trailer.trailerModelInfo?.year || '',
        length: trailer.trailerModelInfo?.length || '',
        weight: trailer.trailerModelInfo?.weight || '',
        weightCapacity: trailer.trailerModelInfo?.weightCapacity || '',
      }))

      return {
        // Core identifiers (existing)
        dockmasterId: item.id,
        hullId: item.serialNumber || item.hin || null,
        name: item.description || `${item.boatModelInfo?.vendorName || ''} ${item.boatModelInfo?.modelNumber || ''}`.trim() || 'Unknown',
        model: item.boatModelInfo?.modelNumber || '',
        make: item.boatModelInfo?.vendorName || '',
        year: item.boatModelInfo?.year || null,
        salesStatus: statusCode,

        // Dimensions (existing)
        length: item.boatModelInfo?.length || null,
        beam: item.boatModelInfo?.beam || null,

        // New basic details
        stockNumber: item.stockNumber || null,
        color: item.color || null,
        listPrice: item.listPrice || null,
        totalCost: item.totalCost || null,
        unitCost: item.unitCost || null,
        optionCost: item.optionCost || null,
        webPrice: item.price1 || null,  // price1 is the web/advertised price
        receivedDate: item.receivedDate || null,
        comments: item.comments || null,

        // New boat specs from boatModelInfo
        draft: item.boatModelInfo?.draft || null,
        weight: item.boatModelInfo?.weight || null,
        hullType: item.boatModelInfo?.hullType || null,
        hullMaterial: item.boatModelInfo?.hullMaterial || null,
        fuelCapacity: item.boatModelInfo?.fuelCapacity || null,
        waterCapacity: item.boatModelInfo?.waterCapacity || null,
        motorRating: item.boatModelInfo?.motorRating || null,
        sleepCapacity: item.boatModelInfo?.sleepCapacity || null,

        // JSONB fields for complex data
        motors: allMotors.length > 0 ? allMotors : null,
        trailers: allTrailers.length > 0 ? allTrailers : null,
        options: item.options && item.options.length > 0 ? item.options : null,
        accessories: item.accessories && item.accessories.length > 0 ? item.accessories : null,

        // Store raw API response for reference
        rawData: item,
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        boats: transformedBoats,
        totalReceived: rawData?.length || 0,
        totalFiltered: transformedBoats.length,
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
