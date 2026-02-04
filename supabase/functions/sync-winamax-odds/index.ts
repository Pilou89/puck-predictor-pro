import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const oddsApiKey = Deno.env.get('THE_ODDS_API_KEY');
    
    if (!oddsApiKey) {
      throw new Error('THE_ODDS_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Starting Winamax FR odds sync...');

    const baseUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds';
    const oddsToInsert: any[] = [];

    let h2hCount = 0;
    let goalScorerCount = 0;
    let playerPointsCount = 0;

    // Helper function to process outcomes from Winamax
    const processWinamaxOdds = (game: any, marketKey: string) => {
      const commenceTime = new Date(game.commence_time);
      const matchName = `${game.away_team} @ ${game.home_team}`;
      
      const winamax = game.bookmakers?.find((b: any) => b.key === 'winamax_fr');
      if (!winamax) return 0;

      let count = 0;
      for (const marketData of winamax.markets || []) {
        if (marketData.key !== marketKey) continue;

        for (const outcome of marketData.outcomes || []) {
          let selection = outcome.name;
          // For player markets, the player name is in "description"
          if (marketKey.startsWith('player_')) {
            selection = outcome.description || outcome.name;
          }
          // Skip generic Yes/No without player name
          if ((selection === 'Yes' || selection === 'No') && !outcome.description) continue;

          oddsToInsert.push({
            commence_time: commenceTime.toISOString(),
            match_name: matchName,
            selection: selection,
            price: outcome.price,
            market_type: marketKey,
            fetched_at: new Date().toISOString(),
          });
          count++;
        }
      }
      return count;
    };

    // ============ PART 1: Fetch H2H odds from FR (always available) ============
    try {
      const h2hUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=fr&markets=h2h&oddsFormat=decimal`;
      console.log('Fetching H2H odds from Winamax FR...');
      
      const response = await fetch(h2hUrl);
      if (response.ok) {
        const data = await response.json();
        console.log(`H2H: Received ${data.length} games`);
        for (const game of data) {
          h2hCount += processWinamaxOdds(game, 'h2h');
        }
      } else {
        console.error(`H2H fetch failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching H2H:', error);
    }

    // ============ PART 2: Try to fetch player_goal_scorer_anytime from FR ============
    try {
      const scorerUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=fr&markets=player_goal_scorer_anytime&oddsFormat=decimal`;
      console.log('Trying player_goal_scorer_anytime from Winamax FR...');
      
      const response = await fetch(scorerUrl);
      if (response.ok) {
        const data = await response.json();
        console.log(`Goal Scorer FR: Received ${data.length} games`);
        for (const game of data) {
          goalScorerCount += processWinamaxOdds(game, 'player_goal_scorer_anytime');
        }
      } else {
        console.log(`Goal Scorer FR not available (${response.status}), skipping`);
      }
    } catch (error) {
      console.log('Goal Scorer FR not available:', error);
    }

    // ============ PART 3: Try to fetch player_points from FR ============
    try {
      const pointsUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=fr&markets=player_points&oddsFormat=decimal`;
      console.log('Trying player_points from Winamax FR...');
      
      const response = await fetch(pointsUrl);
      if (response.ok) {
        const data = await response.json();
        console.log(`Player Points FR: Received ${data.length} games`);
        for (const game of data) {
          playerPointsCount += processWinamaxOdds(game, 'player_points');
        }
      } else {
        console.log(`Player Points FR not available (${response.status}), skipping`);
      }
    } catch (error) {
      console.log('Player Points FR not available:', error);
    }

    console.log(`Total collected: H2H=${h2hCount}, Buteurs=${goalScorerCount}, Points=${playerPointsCount}`);

    // ============ Insert all collected odds ============
    if (oddsToInsert.length > 0) {
      const matchNames = [...new Set(oddsToInsert.map(o => o.match_name))];
      
      // Clear old odds for these matches
      await supabase
        .from('winamax_odds')
        .delete()
        .in('match_name', matchNames);

      const { error: insertError } = await supabase
        .from('winamax_odds')
        .insert(oddsToInsert);

      if (insertError) {
        console.error('Error inserting odds:', insertError);
        throw insertError;
      }

      console.log(`Inserted ${oddsToInsert.length} Winamax FR odds`);
    }

    await supabase
      .from('cron_config')
      .update({ last_run_at: new Date().toISOString() })
      .eq('job_name', 'sync_winamax_odds');

    return new Response(
      JSON.stringify({
        success: true,
        oddsRecorded: oddsToInsert.length,
        h2hOdds: h2hCount,
        goalScorerOdds: goalScorerCount,
        playerPointsOdds: playerPointsCount,
        matchesProcessed: [...new Set(oddsToInsert.map(o => o.match_name))].length,
        note: goalScorerCount === 0 ? 'Cotes buteurs non disponibles sur Winamax FR pour la NHL' : undefined,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Sync Winamax odds error:', error);
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
