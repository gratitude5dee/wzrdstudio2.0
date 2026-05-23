import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminKey = Deno.env.get('ADMIN_CREDITS_API_KEY');
    const providedKey = req.headers.get('x-admin-credits-key');
    if (!adminKey || providedKey !== adminKey) {
      return new Response(
        JSON.stringify({ error: 'Admin credit grants are disabled or unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_id, amount = 50000, transaction_type = 'free' } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return new Response(
        JSON.stringify({ error: 'amount must be greater than zero' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const creditAmount = Math.ceil(Number(amount));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: ensureError } = await supabase.rpc('ensure_credit_account', {
      p_user_id: user_id,
      p_source: 'admin_add_credits',
    });
    if (ensureError) throw ensureError;

    const { data: wallet, error: walletError } = await supabase
      .from('credit_wallets')
      .select('topup_remaining')
      .eq('user_id', user_id)
      .single();
    if (walletError) throw walletError;

    const { error: updateError } = await supabase
      .from('credit_wallets')
      .update({
        topup_remaining: Number(wallet?.topup_remaining || 0) + creditAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user_id);
    if (updateError) throw updateError;

    await supabase
      .from('credit_transactions')
      .insert({
        user_id,
        amount: creditAmount,
        transaction_type,
        resource_type: 'credit',
        metadata: { source: 'admin', note: 'Admin credit addition' },
      });

    await supabase.rpc('ensure_credit_account', {
      p_user_id: user_id,
      p_source: 'admin_add_credits_sync',
    });

    console.log(`Added ${creditAmount} credits to user ${user_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Added ${creditAmount} credits to account`,
        user_id,
        amount: creditAmount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error adding credits:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
