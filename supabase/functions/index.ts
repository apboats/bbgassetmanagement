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
    // - 3 letters (manufacturer code) - positions 0-2
    // - 5 alphanumeric (serial number) - positions 3-7
    // - 1 letter + 1 number (date of manufacture) - positions 8-9
    // - 2 numbers (model year) - positions 10-11
    // Pattern: [A-Z]{3}[A-Z0-9]{5}[A-Z][0-9]{3}

    let hullId = ''
    let confidence = 0

    // Remove US prefix if present
    let searchText = cleanedText
    if (searchText.startsWith('US')) {
      searchText = searchText.substring(2)
    }

    // Common OCR corrections based on position in Hull ID
    // Position 8 MUST be a letter (month code A-L), positions 9-11 MUST be numbers
    const correctOcrMistakes = (text: string): string => {
      if (text.length < 12) return text

      const chars = text.substring(0, 12).split('')

      // Positions 0-2: Must be letters (manufacturer code)
      for (let i = 0; i < 3; i++) {
        chars[i] = digitToLetter(chars[i])
      }

      // Positions 3-7: Can be letters or numbers (serial) - no correction needed

      // Position 8: Must be a letter (month code: A=Jan, B=Feb, ... L=Dec)
      chars[8] = digitToLetter(chars[8])

      // Positions 9-11: Must be numbers (year digits)
      for (let i = 9; i < 12; i++) {
        chars[i] = letterToDigit(chars[i])
      }

      return chars.join('')
    }

    // Convert commonly confused digits to letters
    const digitToLetter = (char: string): string => {
      const digitToLetterMap: Record<string, string> = {
        '0': 'O',
        '1': 'I',
        '2': 'Z',
        '5': 'S',
        '8': 'B',
      }
      return digitToLetterMap[char] || char
    }

    // Convert commonly confused letters to digits
    const letterToDigit = (char: string): string => {
      const letterToDigitMap: Record<string, string> = {
        'O': '0',
        'I': '1',
        'L': '1',
        'Z': '2',
        'S': '5',
        'B': '8',
      }
      return letterToDigitMap[char] || char
    }

    // First, try to apply OCR corrections if we have at least 12 characters
    if (searchText.length >= 12) {
      // Extract first 12 chars and apply corrections based on known positions
      const correctedText = correctOcrMistakes(searchText)

      // Check if corrected text matches exact pattern
      const exactPattern = /^[A-Z]{3}[A-Z0-9]{5}[A-Z][0-9]{3}$/
      if (exactPattern.test(correctedText)) {
        hullId = correctedText
        confidence = 95 // Corrected to match pattern
      } else {
        // Try original text with pattern matching
        const patternMatch = searchText.match(/([A-Z]{3}[A-Z0-9]{5}[A-Z][0-9]{3})/g)
        if (patternMatch && patternMatch.length > 0) {
          hullId = patternMatch[0]
          confidence = 98 // Exact pattern match
        } else {
          // Use corrected text even if not perfect pattern
          hullId = correctedText
          confidence = 80 // Corrected but may have issues
        }
      }
    } else {
      // Not enough characters - try to find any pattern
      const fallbackPattern = /([A-Z]{3}[A-Z0-9]{5,9})/g
      const fallbackMatches = searchText.match(fallbackPattern)

      if (fallbackMatches && fallbackMatches.length > 0) {
        hullId = fallbackMatches[0]
        confidence = 60 // Partial match
      } else if (searchText.length > 0) {
        hullId = searchText
        confidence = 40 // Very low confidence - incomplete
      }
    }

    console.log('OCR Result:', {
      rawText: fullText.substring(0, 100),
      cleanedText: cleanedText.substring(0, 50),
      searchText: searchText.substring(0, 20),
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
