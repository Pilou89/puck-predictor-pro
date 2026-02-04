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
    console.log('Starting Winamax odds sync...');

    const baseUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds';
    const oddsToInsert: any[] = [];

    // ============ PART 1: Fetch H2H odds from FR region (Winamax) ============
    try {
      const frUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=fr&markets=h2h`;
      console.log('Fetching H2H odds from FR region (Winamax)...');
      
      const frResponse = await fetch(frUrl);
      
      if (frResponse.ok) {
        const frData = await frResponse.json();
        console.log(`Received ${frData.length} games for H2H (FR)`);

        for (const game of frData) {
          const commenceTime = new Date(game.commence_time);
          const matchName = `${game.away_team} @ ${game.home_team}`;
          
          // Log des bookmakers disponibles pour debug
          const bookmakerKeys = game.bookmakers?.map((b: any) => b.key) || [];
          console.log(`Match: ${matchName} - FR Bookmakers: ${bookmakerKeys.join(', ')}`);

          // Chercher Winamax FR avec la bonne clé
          const winamax = game.bookmakers?.find((b: any) => b.key === 'winamax_fr');

          if (!winamax) {
            console.log(`No Winamax for ${matchName}`);
            continue;
          }

          for (const marketData of winamax.markets || []) {
            for (const outcome of marketData.outcomes || []) {
              oddsToInsert.push({
                commence_time: commenceTime.toISOString(),
                match_name: matchName,
                selection: outcome.name,
                price: outcome.price,
                market_type: 'h2h',
                fetched_at: new Date().toISOString(),
              });
            }
          }
        }
      } else {
        console.error(`Failed to fetch FR H2H odds: ${frResponse.status}`);
      }
    } catch (error) {
      console.error('Error fetching FR H2H odds:', error);
    }

    // ============ PART 2: Fetch Goal Scorer odds from US region ============
    try {
      // The correct market key is "player_goal_scorer_anytime" (not "player_anytime_goal_scorer")
      const usUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=us&markets=player_goal_scorer_anytime`;
      console.log('Fetching Goal Scorer odds from US region (DraftKings/FanDuel)...');
      
      const usResponse = await fetch(usUrl);
      
      if (usResponse.ok) {
        const usData = await usResponse.json();
        console.log(`Received ${usData.length} games for Goal Scorer (US)`);

        let goalScorerOddsCount = 0;
        for (const game of usData) {
          const commenceTime = new Date(game.commence_time);
          const matchName = `${game.away_team} @ ${game.home_team}`;
          
          // Look for DraftKings, FanDuel, or BetMGM (they have player props)
          const usBookmaker = game.bookmakers?.find((b: any) => 
            ['draftkings', 'fanduel', 'betmgm', 'pointsbetus', 'betrivers'].includes(b.key)
          );

          if (!usBookmaker) {
            continue;
          }

          console.log(`Using ${usBookmaker.key} for ${matchName} goal scorer odds`);

          // Find the anytime goal scorer market
          const goalScorerMarket = usBookmaker.markets?.find((m: any) => 
            m.key === 'player_goal_scorer_anytime'
          );

          if (!goalScorerMarket) continue;

          for (const outcome of goalScorerMarket.outcomes || []) {
            // In the API response: outcome.description is the player name, outcome.name is "Yes"
            const playerName = outcome.description || outcome.name;
            
            // Convert American odds to decimal if needed
            let decimalPrice = outcome.price;
            if (typeof decimalPrice === 'number') {
              // Check if it's American odds (typically > 100 or < -100)
              if (decimalPrice >= 100) {
                decimalPrice = (decimalPrice / 100) + 1;
              } else if (decimalPrice <= -100) {
                decimalPrice = (100 / Math.abs(decimalPrice)) + 1;
              }
            }
            
            oddsToInsert.push({
              commence_time: commenceTime.toISOString(),
              match_name: matchName,
              selection: playerName,
              price: parseFloat(decimalPrice.toFixed(2)),
              market_type: 'player_goal_scorer_anytime',
              fetched_at: new Date().toISOString(),
            });
            goalScorerOddsCount++;
          }
        }
        console.log(`Collected ${goalScorerOddsCount} goal scorer odds from US bookmakers`);
      } else {
        const errorText = await usResponse.text();
        console.error(`Failed to fetch US Goal Scorer odds: ${usResponse.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error fetching US Goal Scorer odds:', error);
    }

    // ============ PART 3: Insert all collected odds ============
    const h2hCount = oddsToInsert.filter(o => o.market_type === 'h2h').length;
    const goalScorerCount = oddsToInsert.filter(o => o.market_type === 'player_goal_scorer_anytime').length;
    console.log(`Total odds collected: ${oddsToInsert.length} (H2H: ${h2hCount}, Goal Scorer: ${goalScorerCount})`);

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

      console.log(`Inserted ${oddsToInsert.length} odds records (H2H + Goal Scorer)`);
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
        matchesProcessed: [...new Set(oddsToInsert.map(o => o.match_name))].length,
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
