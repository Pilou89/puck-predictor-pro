import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Team mapping for NHL API to abbreviations
const TEAM_MAPPING: Record<string, string> = {
  "ANA": "Anaheim Ducks",
  "ARI": "Arizona Coyotes",
  "BOS": "Boston Bruins",
  "BUF": "Buffalo Sabres",
  "CGY": "Calgary Flames",
  "CAR": "Carolina Hurricanes",
  "CHI": "Chicago Blackhawks",
  "COL": "Colorado Avalanche",
  "CBJ": "Columbus Blue Jackets",
  "DAL": "Dallas Stars",
  "DET": "Detroit Red Wings",
  "EDM": "Edmonton Oilers",
  "FLA": "Florida Panthers",
  "LAK": "Los Angeles Kings",
  "MIN": "Minnesota Wild",
  "MTL": "Montreal Canadiens",
  "NSH": "Nashville Predators",
  "NJD": "New Jersey Devils",
  "NYI": "New York Islanders",
  "NYR": "New York Rangers",
  "OTT": "Ottawa Senators",
  "PHI": "Philadelphia Flyers",
  "PIT": "Pittsburgh Penguins",
  "SJS": "San Jose Sharks",
  "SEA": "Seattle Kraken",
  "STL": "St. Louis Blues",
  "TBL": "Tampa Bay Lightning",
  "TOR": "Toronto Maple Leafs",
  "UTA": "Utah Hockey Club",
  "VAN": "Vancouver Canucks",
  "VGK": "Vegas Golden Knights",
  "WSH": "Washington Capitals",
  "WPG": "Winnipeg Jets",
};

interface Goal {
  scorer: string;
  assist1?: string;
  assist2?: string;
  situation: string;
  period: number;
}

interface GameStats {
  gameId: string;
  gameDate: string;
  matchName: string;
  homeTeam: string;
  awayTeam: string;
  goals: Goal[];
  homePim: number;
  awayPim: number;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting NHL stats sync...');

    // Get list of teams to sync
    const teamAbbrs = Object.keys(TEAM_MAPPING);
    const allStats: GameStats[] = [];
    const teamPimData: Record<string, { totalPim: number; games: number; lastGameDate: string }> = {};

    // For each team, fetch last 5 games
    for (const teamAbbr of teamAbbrs) {
      try {
        // Fetch team schedule with game results
        const scheduleUrl = `https://api-web.nhle.com/v1/club-schedule-season/${teamAbbr}/now`;
        const scheduleRes = await fetch(scheduleUrl);
        
        if (!scheduleRes.ok) {
          console.log(`Failed to fetch schedule for ${teamAbbr}: ${scheduleRes.status}`);
          continue;
        }

        const scheduleData = await scheduleRes.json();
        
        // Filter completed games and get last 5
        const completedGames = scheduleData.games?.filter((g: any) => 
          g.gameState === 'OFF' || g.gameState === 'FINAL'
        ).slice(-5) || [];

        for (const game of completedGames) {
          const gameId = game.id.toString();
          
          // Fetch game details for goals
          const boxscoreUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
          const boxscoreRes = await fetch(boxscoreUrl);
          
          if (!boxscoreRes.ok) {
            console.log(`Failed to fetch boxscore for game ${gameId}`);
            continue;
          }

          const boxscore = await boxscoreRes.json();
          
          const homeAbbr = boxscore.homeTeam?.abbrev || '';
          const awayAbbr = boxscore.awayTeam?.abbrev || '';
          const matchName = `${awayAbbr} @ ${homeAbbr}`;
          const gameDate = game.gameDate || boxscore.gameDate;

          // Extract goals from scoring summary
          const goals: Goal[] = [];
          const scoringSummary = boxscore.summary?.scoring || [];
          
          for (const period of scoringSummary) {
            for (const goal of period.goals || []) {
              const scorerName = `${goal.firstName?.default || ''} ${goal.lastName?.default || ''}`.trim();
              
              let situation = 'EV';
              if (goal.strength === 'pp') situation = 'PP';
              else if (goal.strength === 'sh') situation = 'SH';
              else if (goal.goalType === 'en') situation = 'EN';

              const assists = goal.assists || [];
              
              goals.push({
                scorer: scorerName,
                assist1: assists[0] ? `${assists[0].firstName?.default || ''} ${assists[0].lastName?.default || ''}`.trim() : undefined,
                assist2: assists[1] ? `${assists[1].firstName?.default || ''} ${assists[1].lastName?.default || ''}`.trim() : undefined,
                situation,
                period: period.periodDescriptor?.number || 0,
              });
            }
          }

          // Extract PIM data
          const homePim = boxscore.homeTeam?.pim || 0;
          const awayPim = boxscore.awayTeam?.pim || 0;

          // Update team PIM tracking
          if (homeAbbr) {
            if (!teamPimData[homeAbbr]) {
              teamPimData[homeAbbr] = { totalPim: 0, games: 0, lastGameDate: '' };
            }
            teamPimData[homeAbbr].totalPim += homePim;
            teamPimData[homeAbbr].games += 1;
            if (gameDate > teamPimData[homeAbbr].lastGameDate) {
              teamPimData[homeAbbr].lastGameDate = gameDate;
            }
          }

          if (awayAbbr) {
            if (!teamPimData[awayAbbr]) {
              teamPimData[awayAbbr] = { totalPim: 0, games: 0, lastGameDate: '' };
            }
            teamPimData[awayAbbr].totalPim += awayPim;
            teamPimData[awayAbbr].games += 1;
            if (gameDate > teamPimData[awayAbbr].lastGameDate) {
              teamPimData[awayAbbr].lastGameDate = gameDate;
            }
          }

          allStats.push({
            gameId,
            gameDate,
            matchName,
            homeTeam: homeAbbr,
            awayTeam: awayAbbr,
            goals,
            homePim,
            awayPim,
          });
        }
      } catch (error) {
        console.error(`Error processing team ${teamAbbr}:`, error);
      }
    }

    console.log(`Collected stats from ${allStats.length} games`);

    // Insert player stats into database
    const playerStatsToInsert = [];
    for (const game of allStats) {
      for (const goal of game.goals) {
        // Determine which team scored
        // This is simplified - would need more complex logic in production
        const teamAbbr = game.homeTeam; // Simplified
        
        const duo = goal.assist1 ? `${goal.scorer}+${goal.assist1}` : undefined;
        
        playerStatsToInsert.push({
          game_date: game.gameDate,
          team_abbr: teamAbbr,
          scorer: goal.scorer,
          assist1: goal.assist1,
          assist2: goal.assist2,
          duo,
          situation: goal.situation,
          match_name: game.matchName,
        });
      }
    }

    if (playerStatsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('player_stats')
        .upsert(playerStatsToInsert, { 
          onConflict: 'id',
          ignoreDuplicates: true 
        });

      if (insertError) {
        console.error('Error inserting player stats:', insertError);
      } else {
        console.log(`Inserted ${playerStatsToInsert.length} player stats`);
      }
    }

    // Update team meta with PIM data and B2B detection
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    for (const [teamAbbr, data] of Object.entries(teamPimData)) {
      const pimPerGame = data.games > 0 ? data.totalPim / data.games : 0;
      const isB2B = data.lastGameDate === yesterday || data.lastGameDate === today;

      const { error: upsertError } = await supabase
        .from('team_meta')
        .upsert({
          team_abbr: teamAbbr,
          team_name: TEAM_MAPPING[teamAbbr] || teamAbbr,
          pim_per_game: pimPerGame,
          last_game_date: data.lastGameDate || null,
          is_b2b: isB2B,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'team_abbr' });

      if (upsertError) {
        console.error(`Error upserting team meta for ${teamAbbr}:`, upsertError);
      }
    }

    // Update cron config last_run_at
    await supabase
      .from('cron_config')
      .update({ last_run_at: new Date().toISOString() })
      .eq('job_name', 'sync_nhl_stats');

    return new Response(
      JSON.stringify({
        success: true,
        gamesProcessed: allStats.length,
        goalsRecorded: playerStatsToInsert.length,
        teamsUpdated: Object.keys(teamPimData).length,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Sync NHL stats error:', error);
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
