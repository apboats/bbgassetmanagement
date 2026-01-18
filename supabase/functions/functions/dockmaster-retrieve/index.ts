// Supabase Edge Function: Dockmaster Boat Retrieve Proxy
// This proxies requests to the Dockmaster API to avoid CORS issues

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
    // Get boat ID from request
    const { boatId } = await req.json()

    if (!boatId) {
      return new Response(
        JSON.stringify({ error: 'boatId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
    console.log('Authenticating with Dockmaster...')
    const { authToken, systemId } = await authenticateDockmaster(config.username, config.password)
    console.log('Authentication successful, systemId:', systemId)

    // Call Dockmaster API with Bearer token and System ID
    const url = new URL('https://api.dmeapi.com/api/v1/Boats/RetrieveBoat')
    url.searchParams.append('BoatId', boatId)

    console.log('Calling Dockmaster Retrieve API...')
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-DM_SYSTEM_ID': systemId,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Dockmaster API error:', response.status, errorText)
      console.error('Request URL:', url.toString())
      console.error('SystemId used:', systemId)
      return new Response(
        JSON.stringify({ 
          error: `Dockmaster API error: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    console.log('Retrieve successful')

    return new Response(
      JSON.stringify(data),
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
