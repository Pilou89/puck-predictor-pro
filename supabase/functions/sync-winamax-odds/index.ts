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
    
    // Seul le marché h2h est disponible pour la NHL en région FR
    const markets = ['h2h'];
    const oddsToInsert: any[] = [];

    for (const market of markets) {
      try {
        // Utiliser la région FR pour avoir Winamax (sans filtre bookmaker)
        const url = `${baseUrl}?apiKey=${oddsApiKey}&regions=fr&markets=${market}`;
        console.log(`Fetching ${market} odds from FR region...`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch ${market} odds: ${response.status} - ${errorText}`);
          continue;
        }

        const data = await response.json();
        console.log(`Received ${data.length} games for ${market}`);

        for (const game of data) {
          const commenceTime = new Date(game.commence_time);
          const matchName = `${game.away_team} @ ${game.home_team}`;
          
          // Log des bookmakers disponibles pour debug
          const bookmakerKeys = game.bookmakers?.map((b: any) => b.key) || [];
          console.log(`Match: ${matchName} - Bookmakers: ${bookmakerKeys.join(', ')}`);

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
      } catch (error) {
        console.error(`Error fetching ${market} odds:`, error);
      }
    }

    console.log(`Total Winamax odds collected: ${oddsToInsert.length}`);

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

      console.log(`Inserted ${oddsToInsert.length} Winamax odds records`);
    }

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
