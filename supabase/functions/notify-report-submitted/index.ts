// Supabase Edge Function: notify-report-submitted
// Sends email notifications to managers when a weekly report is submitted
// Called from the frontend after a report is submitted

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Resend API for sending emails (popular choice for Supabase Edge Functions)
// You'll need to set RESEND_API_KEY in your Supabase secrets
async function sendEmail(to: string[], subject: string, htmlContent: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (!resendApiKey) {
    console.log('RESEND_API_KEY not configured, skipping email notification')
    return { success: false, reason: 'Email not configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'BBG Asset Management <noreply@boatsbygeorge.com>',
        to,
        subject,
        html: htmlContent,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Resend API error:', response.status, errorText)
      return { success: false, reason: errorText }
    }

    const result = await response.json()
    console.log('Email sent successfully:', result)
    return { success: true, id: result.id }
  } catch (error) {
    console.error('Error sending email:', error)
    return { success: false, reason: error.message }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reportId } = await req.json()

    if (!reportId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Report ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch the report details
    const { data: report, error: reportError } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('id', reportId)
      .single()

    if (reportError || !report) {
      return new Response(
        JSON.stringify({ success: false, error: 'Report not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the submitter's info
    let submitterName = 'Unknown'
    if (report.created_by) {
      const { data: user } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', report.created_by)
        .single()

      if (user) {
        submitterName = user.name || user.email || 'Unknown'
      }
    }

    // Get manager email addresses (users with role 'admin' or 'manager')
    const { data: managers, error: managersError } = await supabase
      .from('users')
      .select('email, name')
      .in('role', ['admin', 'manager'])
      .not('email', 'is', null)

    if (managersError) {
      console.error('Error fetching managers:', managersError)
    }

    const managerEmails = (managers || [])
      .filter(m => m.email)
      .map(m => m.email)

    if (managerEmails.length === 0) {
      console.log('No manager emails found, skipping notification')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Report submitted but no managers to notify',
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format the week range
    const weekStart = new Date(report.week_start)
    const weekEnd = new Date(report.week_end)
    const weekRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    // Build the email content
    const subject = `Weekly Report Submitted: ${weekRange}`
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; }
          .stat { display: inline-block; margin-right: 30px; margin-bottom: 10px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #1e40af; }
          .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
          .notes { background: white; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; margin-top: 15px; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">Weekly Report Submitted</h2>
            <p style="margin: 5px 0 0; opacity: 0.9;">${weekRange}</p>
          </div>
          <div class="content">
            <p><strong>${submitterName}</strong> has submitted the weekly billing report.</p>

            <div style="margin: 20px 0;">
              <div class="stat">
                <div class="stat-value">${report.total_work_orders || 0}</div>
                <div class="stat-label">Work Orders</div>
              </div>
              <div class="stat">
                <div class="stat-value">$${(report.total_charges || 0).toFixed(2)}</div>
                <div class="stat-label">Total Unbilled</div>
              </div>
            </div>

            ${report.notes ? `
              <div class="notes">
                <strong>Notes:</strong>
                <p style="margin: 5px 0 0;">${report.notes}</p>
              </div>
            ` : ''}

            <p style="margin-top: 20px; color: #64748b; font-size: 14px;">
              Submitted at: ${new Date(report.submitted_at).toLocaleString()}
            </p>

            <a href="${supabaseUrl.replace('.supabase.co', '')}/reports" class="button">
              View Report
            </a>
          </div>
        </div>
      </body>
      </html>
    `

    // Send the email
    const emailResult = await sendEmail(managerEmails, subject, htmlContent)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notification sent',
        emailSent: emailResult.success,
        recipients: managerEmails.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Notification error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
