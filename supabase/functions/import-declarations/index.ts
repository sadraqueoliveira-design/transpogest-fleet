import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { origin_url, origin_key } = await req.json()

    if (!origin_url || !origin_key) {
      throw new Error('Missing origin_url or origin_key')
    }

    const originClient = createClient(origin_url, origin_key)

    // 1. Fetch from origin
    const { data: declarations, error: fetchError } = await originClient
      .from('activity_declarations')
      .select('*')

    if (fetchError) throw fetchError

    if (!declarations || declarations.length === 0) {
      return new Response(JSON.stringify({ message: 'No declarations found to import' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Helper function to download and upload to storage
    const migrateFile = async (url: string, bucket: string) => {
      if (!url || !url.includes('supabase.co/storage/v1/object/public/')) return url
      
      try {
        const response = await fetch(url)
        if (!response.ok) return url
        
        const blob = await response.blob()
        const path = url.split('/').pop()
        if (!path) return url

        const { data, error } = await supabaseClient.storage.from(bucket).upload(path, blob, {
          upsert: true
        })

        if (error) {
          console.error(`Error uploading ${path} to ${bucket}:`, error)
          return url
        }

        const { data: publicUrlData } = supabaseClient.storage.from(bucket).getPublicUrl(path)
        return publicUrlData.publicUrl
      } catch (e) {
        console.error(`Failed to migrate file ${url}:`, e)
        return url
      }
    }

    // Allowed columns (must match destination schema)
    const ALLOWED = [
      'id','driver_id','status','gap_start_date','gap_end_date','reason_code','reason_text',
      'company_name','manager_name','manager_id','document_url','created_at','updated_at',
      'driver_signature_url','manager_signature_url','signed_ip','signed_at','signed_pdf_url'
    ]

    // 2. Process and migrate storage files + filter columns
    const migratedDeclarations = await Promise.all(declarations.map(async (dec: any) => {
      const filtered: any = {}
      for (const k of ALLOWED) if (k in dec) filtered[k] = dec[k]

      if (filtered.signed_pdf_url) {
        filtered.signed_pdf_url = await migrateFile(filtered.signed_pdf_url, 'signed-declarations')
      }
      if (filtered.driver_signature_url) {
        filtered.driver_signature_url = await migrateFile(filtered.driver_signature_url, 'signatures')
      }
      if (filtered.manager_signature_url) {
        filtered.manager_signature_url = await migrateFile(filtered.manager_signature_url, 'signatures')
      }

      return filtered
    }))

    // 3. Insert into destination
    const { error: insertError } = await supabaseClient
      .from('activity_declarations')
      .upsert(migratedDeclarations, { onConflict: 'id' })

    if (insertError) throw insertError

    return new Response(JSON.stringify({ 
      message: `Successfully migrated ${declarations.length} declarations and their assets`,
      count: declarations.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
