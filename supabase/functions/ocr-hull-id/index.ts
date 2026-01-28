// Supabase Edge Function: ocr-hull-id
// Uses Google Cloud Vision API for reliable Hull ID text recognition

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    const { imageBase64 } = await req.json()

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ success: false, error: 'Image data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Google Cloud API key from environment
    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY')

    if (!apiKey) {
      console.error('GOOGLE_CLOUD_API_KEY not configured')
      return new Response(
        JSON.stringify({ success: false, error: 'OCR service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // Call Google Cloud Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Data },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            imageContext: {
              languageHints: ['en']
            }
          }]
        })
      }
    )

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text()
      console.error('Google Vision API error:', visionResponse.status, errorText)
      return new Response(
        JSON.stringify({ success: false, error: 'OCR service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const visionData = await visionResponse.json()

    // Extract text from response
    const textAnnotations = visionData.responses?.[0]?.textAnnotations

    if (!textAnnotations || textAnnotations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          text: '',
          confidence: 0,
          message: 'No text detected in image'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // First annotation contains all detected text
    const fullText = textAnnotations[0].description || ''

    // Clean the text: uppercase, remove spaces/dashes/special chars
    const cleanedText = fullText.toUpperCase().replace(/[^A-Z0-9]/g, '')

    // Hull ID format (after removing US- prefix):
    // XXX + NNNNN + LN + YY = 12 characters total
    // - 3 letters (manufacturer code)
    // - 5 alphanumeric (serial number)
    // - 1 letter + 1 number (date of manufacture)
    // - 2 numbers (model year)
    // Pattern: [A-Z]{3}[A-Z0-9]{5}[A-Z][0-9]{3}

    let hullId = ''
    let confidence = 0

    // Remove US prefix if present
    let searchText = cleanedText
    if (searchText.startsWith('US')) {
      searchText = searchText.substring(2)
    }

    // Try to find the exact Hull ID pattern
    // 3 letters + 5 alphanumeric + 1 letter + 1 digit + 2 digits = 12 chars
    const exactPattern = /([A-Z]{3}[A-Z0-9]{5}[A-Z][0-9]{3})/g
    const exactMatches = searchText.match(exactPattern)

    if (exactMatches && exactMatches.length > 0) {
      hullId = exactMatches[0]
      confidence = 98 // Exact pattern match
    } else {
      // Fallback: look for any 12-character alphanumeric sequence starting with 3 letters
      const fallbackPattern = /([A-Z]{3}[A-Z0-9]{9})/g
      const fallbackMatches = searchText.match(fallbackPattern)

      if (fallbackMatches && fallbackMatches.length > 0) {
        hullId = fallbackMatches[0]
        confidence = 85 // Close pattern match
      } else if (searchText.length >= 12) {
        // Last resort: take first 12 characters if it starts with letters
        const startLetters = searchText.match(/^[A-Z]{3}/)
        if (startLetters) {
          hullId = searchText.substring(0, 12)
          confidence = 70 // Partial match
        } else {
          hullId = searchText.substring(0, Math.min(12, searchText.length))
          confidence = 50 // Low confidence
        }
      } else if (searchText.length > 0) {
        hullId = searchText
        confidence = 40 // Very low confidence - incomplete
      }
    }

    console.log('OCR Result:', {
      rawText: fullText.substring(0, 100),
      cleanedText: cleanedText.substring(0, 50),
      hullId,
      confidence
    })

    return new Response(
      JSON.stringify({
        success: true,
        text: hullId,
        rawText: cleanedText,
        confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('OCR error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
