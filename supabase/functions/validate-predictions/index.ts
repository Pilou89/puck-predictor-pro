import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting prediction validation...');

    // Get yesterday's date
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Fetch unvalidated predictions from yesterday
    const { data: predictions, error: fetchError } = await supabase
      .from('prediction_history')
      .select('*')
      .eq('prediction_date', yesterdayStr)
      .is('outcome_win', null);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${predictions?.length || 0} predictions to validate`);

    if (!predictions || predictions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, validated: 0 }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Fetch actual results from player_stats
    const { data: actualGoals, error: goalsError } = await supabase
      .from('player_stats')
      .select('scorer, match_name, situation')
      .eq('game_date', yesterdayStr);

    if (goalsError) {
      throw goalsError;
    }

    console.log(`Found ${actualGoals?.length || 0} actual goals from yesterday`);

    // Create lookup for quick matching
    const goalScorers = new Set(actualGoals?.map(g => g.scorer.toLowerCase()) || []);
    const matchResults = new Map<string, string[]>();
    
    for (const goal of actualGoals || []) {
      const matchKey = goal.match_name.toLowerCase();
      if (!matchResults.has(matchKey)) {
        matchResults.set(matchKey, []);
      }
      matchResults.get(matchKey)!.push(goal.scorer.toLowerCase());
    }

    // Validate each prediction
    let validated = 0;
    let wins = 0;

    for (const prediction of predictions) {
      let outcomeWin = false;

      // Check based on market type
      if (prediction.market_type === 'player_anytime_goal_scorer') {
        // Check if the player scored
        outcomeWin = goalScorers.has(prediction.selection.toLowerCase());
      } else if (prediction.market_type === 'h2h') {
        // For h2h, we'd need to check the actual game result
        // This would require fetching game scores - simplified for now
        outcomeWin = false; // Would need actual game results
      } else if (prediction.market_type === 'player_points') {
        // For points, we'd need assists too - simplified
        outcomeWin = goalScorers.has(prediction.selection.toLowerCase());
      }

      // Update the prediction
      const { error: updateError } = await supabase
        .from('prediction_history')
        .update({
          outcome_win: outcomeWin,
          validated_at: new Date().toISOString(),
        })
        .eq('id', prediction.id);

      if (!updateError) {
        validated++;
        if (outcomeWin) wins++;
      }
    }

    console.log(`Validated ${validated} predictions, ${wins} wins`);

    // Update cron config last_run_at
    await supabase
      .from('cron_config')
      .update({ last_run_at: new Date().toISOString() })
      .eq('job_name', 'validate_predictions');

    return new Response(
      JSON.stringify({
        success: true,
        validated,
        wins,
        losses: validated - wins,
        winRate: validated > 0 ? (wins / validated * 100).toFixed(1) + '%' : 'N/A',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Validate predictions error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
