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

    // 2. Insert into destination
    const { error: insertError } = await supabaseClient
      .from('activity_declarations')
      .upsert(declarations, { onConflict: 'id' })

    if (insertError) throw insertError

    return new Response(JSON.stringify({ 
      message: `Successfully imported ${declarations.length} declarations`,
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
