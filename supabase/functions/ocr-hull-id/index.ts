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

    // Clean the text: uppercase, keep only alphanumeric characters
    const cleanedText = fullText.toUpperCase().replace(/[^A-Z0-9]/g, '')

    // Try to find a Hull ID pattern (typically 12-17 alphanumeric characters)
    // Hull IDs often start with letters followed by numbers
    // Common patterns: ABC12345D678901 or similar
    let hullId = cleanedText

    // If the cleaned text is very long, try to find the most likely Hull ID
    // Hull IDs are typically 12-17 characters
    if (cleanedText.length > 20) {
      // Look for a sequence that looks like a Hull ID
      const matches = cleanedText.match(/[A-Z]{2,4}[A-Z0-9]{8,14}/g)
      if (matches && matches.length > 0) {
        // Take the longest match that's within Hull ID length range
        hullId = matches
          .filter(m => m.length >= 12 && m.length <= 17)
          .sort((a, b) => b.length - a.length)[0] || matches[0]
      }
    }

    // Calculate a confidence score based on text length and pattern match
    let confidence = 0
    if (hullId.length >= 12 && hullId.length <= 17) {
      confidence = 95 // Good length for Hull ID
    } else if (hullId.length >= 8) {
      confidence = 75 // Acceptable length
    } else if (hullId.length > 0) {
      confidence = 50 // Short text detected
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
