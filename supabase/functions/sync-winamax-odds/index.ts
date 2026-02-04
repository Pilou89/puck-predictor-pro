import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const oddsApiKey = Deno.env.get('THE_ODDS_API_KEY');
    
    if (!oddsApiKey) {
      throw new Error('THE_ODDS_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting Winamax odds sync...');

    // Fetch NHL odds from The Odds API
    // Using EU region to get Winamax
    const baseUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds';
    
    // Markets to fetch
    const markets = ['h2h', 'player_anytime_goal_scorer', 'player_points'];
    const oddsToInsert: any[] = [];

    for (const market of markets) {
      try {
        const url = `${baseUrl}?apiKey=${oddsApiKey}&regions=eu&markets=${market}&bookmakers=winamax`;
        console.log(`Fetching ${market} odds...`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`Failed to fetch ${market} odds: ${response.status}`);
          continue;
        }

        const data = await response.json();
        console.log(`Received ${data.length} games for ${market}`);

        for (const game of data) {
          const commenceTime = new Date(game.commence_time);
          const matchName = `${game.away_team} @ ${game.home_team}`;

          // Find Winamax bookmaker
          const winamax = game.bookmakers?.find((b: any) => 
            b.key === 'winamax' || b.title?.toLowerCase().includes('winamax')
          );

          if (!winamax) continue;

          for (const marketData of winamax.markets || []) {
            for (const outcome of marketData.outcomes || []) {
              oddsToInsert.push({
                commence_time: commenceTime.toISOString(),
                match_name: matchName,
                selection: outcome.name,
                price: outcome.price,
                market_type: market === 'player_anytime_goal_scorer' 
                  ? 'player_anytime_goal_scorer' 
                  : market === 'player_points' 
                    ? 'player_points' 
                    : 'h2h',
                fetched_at: new Date().toISOString(),
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching ${market} odds:`, error);
      }
    }

    console.log(`Total odds collected: ${oddsToInsert.length}`);

    // Insert odds into database
    if (oddsToInsert.length > 0) {
      // Delete old odds for matches that are being updated
      const matchNames = [...new Set(oddsToInsert.map(o => o.match_name))];
      
      await supabase
        .from('winamax_odds')
        .delete()
        .in('match_name', matchNames);

      // Insert new odds
      const { error: insertError } = await supabase
        .from('winamax_odds')
        .insert(oddsToInsert);

      if (insertError) {
        console.error('Error inserting odds:', insertError);
        throw insertError;
      }

      console.log(`Inserted ${oddsToInsert.length} odds records`);
    }

    // Update cron config last_run_at
    await supabase
      .from('cron_config')
      .update({ last_run_at: new Date().toISOString() })
      .eq('job_name', 'sync_winamax_odds');

    return new Response(
      JSON.stringify({
        success: true,
        oddsRecorded: oddsToInsert.length,
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
