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
    console.log('Starting odds sync (FR for H2H, US for player props)...');

    const baseUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds';
    const oddsToInsert: any[] = [];

    let h2hCount = 0;
    let goalScorerCount = 0;
    let playerPointsCount = 0;

    // ============ PART 1: H2H from FR region (Winamax) ============
    try {
      const frUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=fr&markets=h2h&oddsFormat=decimal`;
      console.log('Fetching H2H from Winamax FR...');
      
      const response = await fetch(frUrl);
      if (response.ok) {
        const data = await response.json();
        console.log(`H2H FR: ${data.length} games`);
        
        for (const game of data) {
          const commenceTime = new Date(game.commence_time);
          const matchName = `${game.away_team} @ ${game.home_team}`;
          
          const winamax = game.bookmakers?.find((b: any) => b.key === 'winamax_fr');
          if (!winamax) continue;

          for (const market of winamax.markets || []) {
            if (market.key !== 'h2h') continue;
            for (const outcome of market.outcomes || []) {
              oddsToInsert.push({
                commence_time: commenceTime.toISOString(),
                match_name: matchName,
                selection: outcome.name,
                price: outcome.price,
                market_type: 'h2h',
                fetched_at: new Date().toISOString(),
              });
              h2hCount++;
            }
          }
        }
        console.log(`H2H Winamax FR: ${h2hCount} cotes`);
      } else {
        console.error(`H2H FR failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching H2H FR:', error);
    }

    // ============ PART 2: Player props from US region (DraftKings/FanDuel) ============
    const usBookmakers = ['draftkings', 'fanduel', 'betmgm', 'pointsbetus', 'betrivers'];
    
    // Goal Scorer
    try {
      const usUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=us&markets=player_goal_scorer_anytime&oddsFormat=decimal`;
      console.log('Fetching Goal Scorer from US...');
      
      const response = await fetch(usUrl);
      if (response.ok) {
        const data = await response.json();
        console.log(`Goal Scorer US: ${data.length} games`);
        
        for (const game of data) {
          const commenceTime = new Date(game.commence_time);
          const matchName = `${game.away_team} @ ${game.home_team}`;
          
          const bookmaker = game.bookmakers?.find((b: any) => usBookmakers.includes(b.key));
          if (!bookmaker) continue;

          const market = bookmaker.markets?.find((m: any) => m.key === 'player_goal_scorer_anytime');
          if (!market) continue;

          for (const outcome of market.outcomes || []) {
            const playerName = outcome.description || outcome.name;
            if (playerName === 'Yes' || playerName === 'No') continue;

            oddsToInsert.push({
              commence_time: commenceTime.toISOString(),
              match_name: matchName,
              selection: playerName,
              price: outcome.price,
              market_type: 'player_goal_scorer_anytime',
              fetched_at: new Date().toISOString(),
            });
            goalScorerCount++;
          }
        }
        console.log(`Goal Scorer US: ${goalScorerCount} cotes`);
      } else {
        console.log(`Goal Scorer US not available: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching Goal Scorer US:', error);
    }

    // Player Points
    try {
      const usUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=us&markets=player_points&oddsFormat=decimal`;
      console.log('Fetching Player Points from US...');
      
      const response = await fetch(usUrl);
      if (response.ok) {
        const data = await response.json();
        console.log(`Player Points US: ${data.length} games`);
        
        for (const game of data) {
          const commenceTime = new Date(game.commence_time);
          const matchName = `${game.away_team} @ ${game.home_team}`;
          
          const bookmaker = game.bookmakers?.find((b: any) => usBookmakers.includes(b.key));
          if (!bookmaker) continue;

          const market = bookmaker.markets?.find((m: any) => m.key === 'player_points');
          if (!market) continue;

          for (const outcome of market.outcomes || []) {
            const playerName = outcome.description || outcome.name;
            if (playerName === 'Over' || playerName === 'Under') continue;

            oddsToInsert.push({
              commence_time: commenceTime.toISOString(),
              match_name: matchName,
              selection: playerName,
              price: outcome.price,
              market_type: 'player_points',
              fetched_at: new Date().toISOString(),
            });
            playerPointsCount++;
          }
        }
        console.log(`Player Points US: ${playerPointsCount} cotes`);
      } else {
        console.log(`Player Points US not available: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching Player Points US:', error);
    }

    console.log(`Total: H2H(FR)=${h2hCount}, Buteurs(US)=${goalScorerCount}, Points(US)=${playerPointsCount}`);

    // ============ Insert all collected odds ============
    if (oddsToInsert.length > 0) {
      const matchNames = [...new Set(oddsToInsert.map(o => o.match_name))];
      
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

      console.log(`Inserted ${oddsToInsert.length} odds`);
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
        sources: { h2h: 'Winamax FR', playerProps: 'US (DraftKings/FanDuel)' },
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Sync odds error:', error);
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
