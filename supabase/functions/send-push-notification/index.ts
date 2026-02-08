import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@boatsbygeorgemap.com'

// ---- Base64URL helpers ----

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(base64 + padding)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}

// ---- VAPID JWT (ES256) ----

async function generateVapidJwt(
  audience: string,
  subject: string,
  publicKeyB64: string,
  privateKeyB64: string,
): Promise<string> {
  const pubKeyBytes = base64UrlDecode(publicKeyB64)
  const privKeyBytes = base64UrlDecode(privateKeyB64)

  // Public key: 65 bytes (0x04 || x[32] || y[32])
  const x = base64UrlEncode(pubKeyBytes.slice(1, 33))
  const y = base64UrlEncode(pubKeyBytes.slice(33, 65))
  const d = base64UrlEncode(privKeyBytes)

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  })))

  const unsignedToken = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken),
  )

  return `${unsignedToken}.${base64UrlEncode(signature)}`
}

// ---- Web Push Encryption (RFC 8291 + RFC 8188) ----

async function encryptPayload(
  p256dhB64: string,
  authB64: string,
  payloadText: string,
): Promise<Uint8Array> {
  const subscriberPubBytes = base64UrlDecode(p256dhB64)
  const authBytes = base64UrlDecode(authB64)

  // Generate ephemeral ECDH key pair
  const localKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )

  // Import subscriber public key
  const subscriberPubKey = await crypto.subtle.importKey(
    'raw',
    subscriberPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberPubKey },
    localKeys.privateKey,
    256,
  )

  // Export local public key (65 bytes raw)
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey))

  // key_info = "WebPush: info" || 0x00 || subscriber_pub || local_pub
  const infoPrefix = new TextEncoder().encode('WebPush: info\0')
  const keyInfo = new Uint8Array(infoPrefix.length + subscriberPubBytes.length + localPubRaw.length)
  keyInfo.set(infoPrefix)
  keyInfo.set(subscriberPubBytes, infoPrefix.length)
  keyInfo.set(localPubRaw, infoPrefix.length + subscriberPubBytes.length)

  // IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info=key_info, len=32)
  const sharedSecretKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveBits'])
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authBytes, info: keyInfo },
    sharedSecretKey,
    256,
  )

  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])

  // Random salt for content encryption
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: aes128gcm\0') },
    ikmKey,
    128,
  )

  // Nonce = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: nonce\0') },
    ikmKey,
    96,
  )

  // Pad payload: content || 0x02 (delimiter)
  const payloadBytes = new TextEncoder().encode(payloadText)
  const padded = new Uint8Array(payloadBytes.length + 1)
  padded.set(payloadBytes)
  padded[payloadBytes.length] = 2

  // Encrypt with AES-128-GCM
  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt'])
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonceBits) },
    cek,
    padded,
  ))

  // aes128gcm header: salt(16) || rs(4, big-endian) || idlen(1) || keyid(65) || ciphertext
  const header = new Uint8Array(16 + 4 + 1 + localPubRaw.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = localPubRaw.length
  header.set(localPubRaw, 21)

  const body = new Uint8Array(header.length + encrypted.length)
  body.set(header)
  body.set(encrypted, header.length)

  return body
}

// ---- Send single push notification ----

async function sendPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const url = new URL(endpoint)
    const audience = `${url.protocol}//${url.host}`

    const jwt = await generateVapidJwt(audience, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    const body = await encryptPayload(p256dh, auth, payload)

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Urgency': 'normal',
      },
      body,
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error(`Push failed (${resp.status}):`, text)
      return { success: false, status: resp.status, error: text }
    }

    console.log(`Push sent (${resp.status}) to ${endpoint.substring(0, 60)}...`)
    return { success: true, status: resp.status }
  } catch (err: any) {
    console.error('Push error:', err.message)
    return { success: false, error: err.message }
  }
}

// ---- Main handler ----

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userIds, title, body, url, tag } = await req.json()

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'userIds array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.log('VAPID keys not configured')
      return new Response(
        JSON.stringify({ success: false, reason: 'VAPID keys not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', userIds)

    if (subError) throw subError

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for users:', userIds)
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`Found ${subscriptions.length} subscription(s), sending push...`)

    const payload = JSON.stringify({
      title: title || 'BBG Alert',
      body: body || 'You have a new notification',
      url: url || '/alerts',
      tag: tag || 'bbg-mention',
    })

    const results = await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        const result = await sendPush(sub.endpoint, sub.p256dh, sub.auth, payload)

        if (result.success) {
          await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)
        } else if (result.status === 410 || result.status === 404) {
          console.log(`Removing expired subscription: ${sub.id}`)
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }

        return result
      }),
    )

    const sent = results.filter(
      (r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<any>).value.success,
    ).length

    return new Response(
      JSON.stringify({ success: true, sent, total: subscriptions.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
