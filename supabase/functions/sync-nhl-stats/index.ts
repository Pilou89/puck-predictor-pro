import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// All 32 NHL teams mapping (abbr -> full name)
const TEAM_MAPPING: Record<string, string> = {
  "ANA": "Anaheim Ducks",
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

// Team ID to abbreviation mapping (NHL API uses team IDs)
const TEAM_ID_TO_ABBR: Record<number, string> = {
  1: "NJD", 2: "NYI", 3: "NYR", 4: "PHI", 5: "PIT", 6: "BOS",
  7: "BUF", 8: "MTL", 9: "OTT", 10: "TOR", 12: "CAR", 13: "FLA",
  14: "TBL", 15: "WSH", 16: "CHI", 17: "DET", 18: "NSH", 19: "STL",
  20: "CGY", 21: "COL", 22: "EDM", 23: "VAN", 24: "ANA", 25: "DAL",
  26: "LAK", 28: "SJS", 29: "CBJ", 30: "MIN", 52: "WPG", 53: "ARI",
  54: "VGK", 55: "SEA", 59: "UTA",
};

interface GoalData {
  scorer: string;
  scorerTeamAbbr: string;
  assist1?: string;
  assist2?: string;
  situation: string;
  period: number;
  timeInPeriod: string;
}

interface GameData {
  gameId: string;
  gameDate: string;
  matchName: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  goals: GoalData[];
  homePim: number;
  awayPim: number;
}

// Extract PIM with multiple fallback paths
function extractTeamPim(boxscore: any, teamKey: 'homeTeam' | 'awayTeam'): number {
  // Path 1: Direct on team object
  if (boxscore[teamKey]?.pim !== undefined && boxscore[teamKey].pim > 0) {
    return boxscore[teamKey].pim;
  }
  
  // Path 2: In boxscore.boxscore.teamGameStats
  if (boxscore.boxscore?.teamGameStats?.[teamKey]?.pim !== undefined) {
    return boxscore.boxscore.teamGameStats[teamKey].pim;
  }
  
  // Path 3: In summary.teamGameStats
  if (boxscore.summary?.teamGameStats?.[teamKey]?.pim !== undefined) {
    return boxscore.summary.teamGameStats[teamKey].pim;
  }
  
  // Path 4: Calculate from individual players in playerByGameStats
  const players = boxscore.playerByGameStats?.[teamKey];
  if (players) {
    const allPlayers = [
      ...(players.forwards || []),
      ...(players.defense || []),
      ...(players.goalies || [])
    ];
    const totalPim = allPlayers.reduce((sum: number, p: any) => sum + (p.pim || 0), 0);
    if (totalPim > 0) {
      return totalPim;
    }
  }
  
  // Path 5: Try boxscore.boxscore.playerByGameStats
  const boxscorePlayers = boxscore.boxscore?.playerByGameStats?.[teamKey];
  if (boxscorePlayers) {
    const allPlayers = [
      ...(boxscorePlayers.forwards || []),
      ...(boxscorePlayers.defense || []),
      ...(boxscorePlayers.goalies || [])
    ];
    return allPlayers.reduce((sum: number, p: any) => sum + (p.pim || 0), 0);
  }
  
  return 0;
}

// Build player ID to name mapping from boxscore data
function buildPlayerNameMap(boxscore: any): Map<number, string> {
  const playerMap = new Map<number, string>();
  
  // Extract from playerByGameStats
  for (const teamKey of ['homeTeam', 'awayTeam']) {
    const teamStats = boxscore.playerByGameStats?.[teamKey];
    if (!teamStats) continue;
    
    const allPlayers = [
      ...(teamStats.forwards || []),
      ...(teamStats.defense || []),
      ...(teamStats.goalies || [])
    ];
    
    for (const player of allPlayers) {
      if (player.playerId && player.name?.default) {
        playerMap.set(player.playerId, player.name.default);
      }
    }
  }
  
  // Also try rosterSpots if available
  for (const teamKey of ['homeTeam', 'awayTeam']) {
    const roster = boxscore[teamKey]?.roster || boxscore.rosterSpots?.[teamKey] || [];
    for (const player of roster) {
      if (player.playerId && player.firstName && player.lastName) {
        playerMap.set(player.playerId, `${player.firstName.default || player.firstName} ${player.lastName.default || player.lastName}`);
      }
    }
  }
  
  return playerMap;
}

// Helper to create a unique hash for deduplication
function createGoalHash(gameDate: string, scorer: string, matchName: string, period: number, timeInPeriod: string): string {
  return `${gameDate}_${scorer}_${matchName}_${period}_${timeInPeriod}`.toLowerCase().replace(/\s+/g, '_');
}

// Helper to determine goal situation from situationCode
function determineSituation(situationCode: string, goalModifier?: string): string {
  // Check goalModifier first (more reliable)
  if (goalModifier) {
    const modifier = goalModifier.toLowerCase();
    if (modifier.includes('power-play') || modifier.includes('powerplay') || modifier.includes('pp')) return 'PP';
    if (modifier.includes('short-handed') || modifier.includes('shorthanded') || modifier.includes('sh')) return 'SH';
    if (modifier.includes('empty-net') || modifier.includes('emptynet') || modifier.includes('en')) return 'EN';
  }
  
  // Fallback to situationCode parsing
  // situationCode format: "1551" = home goalie in, 5 skaters, 5 skaters, away goalie in
  if (!situationCode || situationCode.length < 4) return 'EV';
  
  const homeSkaters = parseInt(situationCode[1]) || 5;
  const awaySkaters = parseInt(situationCode[2]) || 5;
  
  if (homeSkaters > awaySkaters || awaySkaters > homeSkaters) return 'PP';
  if (homeSkaters < awaySkaters || awaySkaters < homeSkaters) return 'SH';
  
  return 'EV';
}

// Fetch play-by-play for a single game to get REAL goal details with assists
async function fetchGamePlayByPlay(gameId: string, homeAbbr: string, awayAbbr: string, playerNameMap: Map<number, string>): Promise<GoalData[]> {
  try {
    const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`Failed to fetch play-by-play for game ${gameId}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const goals: GoalData[] = [];
    
    // Build player map from play-by-play data if needed
    if (data.rosterSpots) {
      for (const player of data.rosterSpots) {
        if (player.playerId && player.firstName && player.lastName) {
          const firstName = player.firstName?.default || player.firstName;
          const lastName = player.lastName?.default || player.lastName;
          playerNameMap.set(player.playerId, `${firstName} ${lastName}`);
        }
      }
    }
    
    for (const play of data.plays || []) {
      // Look for goal events
      if (play.typeDescKey === 'goal') {
        const details = play.details || {};
        
        // Get scorer name from player ID using our mapping
        const scorerId = details.scoringPlayerId;
        let scorerName = playerNameMap.get(scorerId) || '';
        
        if (!scorerName) {
          console.log(`Unknown player ID ${scorerId} in game ${gameId}`);
          continue;
        }
        
        // Determine team abbreviation from eventOwnerTeamId
        const teamId = details.eventOwnerTeamId;
        const scorerTeamAbbr = TEAM_ID_TO_ABBR[teamId] || (teamId === data.homeTeam?.id ? homeAbbr : awayAbbr);
        
        // Get assist names using player ID mapping
        const assist1Id = details.assist1PlayerId;
        const assist2Id = details.assist2PlayerId;
        const assist1Name = assist1Id ? playerNameMap.get(assist1Id) : undefined;
        const assist2Name = assist2Id ? playerNameMap.get(assist2Id) : undefined;
        
        // Determine situation (PP, SH, EN, EV)
        const situation = determineSituation(
          play.situationCode || '', 
          details.goalModifier || play.typeDescriptor?.modifier
        );
        
        goals.push({
          scorer: scorerName,
          scorerTeamAbbr,
          assist1: assist1Name,
          assist2: assist2Name,
          situation,
          period: play.periodDescriptor?.number || 0,
          timeInPeriod: play.timeInPeriod || '00:00',
        });
      }
    }
    
    console.log(`Game ${gameId} play-by-play: ${goals.length} goals extracted`);
    return goals;
  } catch (error) {
    console.error(`Error fetching play-by-play for game ${gameId}:`, error);
    return [];
  }
}

// Fetch boxscore for basic game info and PIM data
async function fetchGameBoxscore(gameId: string): Promise<GameData | null> {
  try {
    const boxscoreUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
    const response = await fetch(boxscoreUrl);
    
    if (!response.ok) {
      console.log(`Failed to fetch boxscore for game ${gameId}: ${response.status}`);
      return null;
    }

    const boxscore = await response.json();
    
    // Only process finished games
    if (boxscore.gameState !== 'FINAL' && boxscore.gameState !== 'OFF') {
      return null;
    }
    
    const homeAbbr = boxscore.homeTeam?.abbrev || '';
    const awayAbbr = boxscore.awayTeam?.abbrev || '';
    const gameDate = boxscore.gameDate || '';
    const matchName = `${awayAbbr} @ ${homeAbbr}`;
    
    const homeScore = boxscore.homeTeam?.score || 0;
    const awayScore = boxscore.awayTeam?.score || 0;
    
    // Extract PIM using robust fallback logic
    const homePim = extractTeamPim(boxscore, 'homeTeam');
    const awayPim = extractTeamPim(boxscore, 'awayTeam');
    
    // Build player name map from boxscore
    const playerNameMap = buildPlayerNameMap(boxscore);
    console.log(`Game ${gameId} - ${playerNameMap.size} players mapped, PIM: home=${homePim}, away=${awayPim}`);

    // Fetch REAL goals from play-by-play endpoint (includes assists!)
    const goals = await fetchGamePlayByPlay(gameId, homeAbbr, awayAbbr, playerNameMap);

    return {
      gameId,
      gameDate,
      matchName,
      homeTeam: homeAbbr,
      awayTeam: awayAbbr,
      homeScore,
      awayScore,
      goals,
      homePim,
      awayPim,
    };
  } catch (error) {
    console.error(`Error fetching boxscore for game ${gameId}:`, error);
    return null;
  }
}

// Fetch recent games for a team
async function fetchTeamRecentGames(teamAbbr: string, numGames: number = 5): Promise<string[]> {
  try {
    const scheduleUrl = `https://api-web.nhle.com/v1/club-schedule-season/${teamAbbr}/now`;
    const response = await fetch(scheduleUrl);
    
    if (!response.ok) {
      console.log(`Failed to fetch schedule for ${teamAbbr}: ${response.status}`);
      return [];
    }

    const scheduleData = await response.json();
    
    // Filter completed games and get last N game IDs
    const completedGames = (scheduleData.games || [])
      .filter((g: { gameState: string }) => g.gameState === 'OFF' || g.gameState === 'FINAL')
      .slice(-numGames);

    return completedGames.map((g: { id: number }) => g.id.toString());
  } catch (error) {
    console.error(`Error fetching schedule for ${teamAbbr}:`, error);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('=== Starting NHL Stats Sync (with Play-By-Play for DUOs) ===');
    const startTime = Date.now();

    // Collect all unique game IDs from all teams
    const allGameIds = new Set<string>();
    const teamAbbrs = Object.keys(TEAM_MAPPING);
    
    console.log(`Fetching schedules for ${teamAbbrs.length} teams...`);
    
    // Fetch schedules in batches to avoid rate limiting
    const batchSize = 8;
    for (let i = 0; i < teamAbbrs.length; i += batchSize) {
      const batch = teamAbbrs.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(abbr => fetchTeamRecentGames(abbr, 5))
      );
      
      for (const gameIds of results) {
        for (const id of gameIds) {
          allGameIds.add(id);
        }
      }
      
      // Small delay between batches
      if (i + batchSize < teamAbbrs.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Found ${allGameIds.size} unique games to process`);

    // Fetch all game details
    const gameIdArray = Array.from(allGameIds);
    const allGames: GameData[] = [];
    const teamPimData: Record<string, { totalPim: number; games: number; lastGameDate: string }> = {};
    
    // Fetch boxscores in batches
    for (let i = 0; i < gameIdArray.length; i += batchSize) {
      const batch = gameIdArray.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(gameId => fetchGameBoxscore(gameId))
      );
      
      for (const game of results) {
        if (game) {
          allGames.push(game);
          
          // Track PIM data for each team
          const { homeTeam, awayTeam, homePim, awayPim, gameDate } = game;
          
          if (homeTeam) {
            if (!teamPimData[homeTeam]) {
              teamPimData[homeTeam] = { totalPim: 0, games: 0, lastGameDate: '' };
            }
            teamPimData[homeTeam].totalPim += homePim;
            teamPimData[homeTeam].games += 1;
            if (gameDate > teamPimData[homeTeam].lastGameDate) {
              teamPimData[homeTeam].lastGameDate = gameDate;
            }
          }
          
          if (awayTeam) {
            if (!teamPimData[awayTeam]) {
              teamPimData[awayTeam] = { totalPim: 0, games: 0, lastGameDate: '' };
            }
            teamPimData[awayTeam].totalPim += awayPim;
            teamPimData[awayTeam].games += 1;
            if (gameDate > teamPimData[awayTeam].lastGameDate) {
              teamPimData[awayTeam].lastGameDate = gameDate;
            }
          }
        }
      }
      
      // Small delay between batches
      if (i + batchSize < gameIdArray.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Processed ${allGames.length} games with boxscore + play-by-play data`);

    // Count goals with and without assists for logging
    let goalsWithAssist = 0;
    let goalsWithoutAssist = 0;

    // Prepare player stats for insertion
    const playerStatsToInsert: Array<{
      game_date: string;
      team_abbr: string;
      scorer: string;
      assist1: string | null;
      assist2: string | null;
      duo: string | null;
      situation: string;
      match_name: string;
    }> = [];
    
    const seenGoals = new Set<string>();

    for (const game of allGames) {
      for (const goal of game.goals) {
        // Skip if we don't have scorer info
        if (!goal.scorer || !goal.scorerTeamAbbr) continue;
        
        // Create unique hash to prevent duplicates (using period + time for uniqueness)
        const goalHash = createGoalHash(
          game.gameDate, 
          goal.scorer, 
          game.matchName, 
          goal.period,
          goal.timeInPeriod
        );
        
        if (seenGoals.has(goalHash)) continue;
        seenGoals.add(goalHash);
        
        // Create duo string if there's a first assist
        const duo = goal.assist1 ? `${goal.scorer}+${goal.assist1}` : null;
        
        if (goal.assist1) {
          goalsWithAssist++;
        } else {
          goalsWithoutAssist++;
        }
        
        playerStatsToInsert.push({
          game_date: game.gameDate,
          team_abbr: goal.scorerTeamAbbr,
          scorer: goal.scorer,
          assist1: goal.assist1 || null,
          assist2: goal.assist2 || null,
          duo,
          situation: goal.situation,
          match_name: game.matchName,
        });
      }
    }

    console.log(`Prepared ${playerStatsToInsert.length} goal records (${goalsWithAssist} with assist, ${goalsWithoutAssist} without)`);

    // Insert player stats (in batches to avoid payload limits)
    let insertedCount = 0;
    const insertBatchSize = 100;
    
    for (let i = 0; i < playerStatsToInsert.length; i += insertBatchSize) {
      const batch = playerStatsToInsert.slice(i, i + insertBatchSize);
      
      const { error: insertError } = await supabase
        .from('player_stats')
        .upsert(batch, { 
          onConflict: 'id',
          ignoreDuplicates: true 
        });

      if (insertError) {
        console.error(`Error inserting player stats batch ${i}:`, insertError);
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`Inserted/updated ${insertedCount} player stats records`);

    // Update team_meta with PIM averages and B2B status
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    let teamsUpdated = 0;
    
    for (const [teamAbbr, data] of Object.entries(teamPimData)) {
      const pimPerGame = data.games > 0 ? Math.round((data.totalPim / data.games) * 10) / 10 : 0;
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
      } else {
        teamsUpdated++;
      }
    }

    console.log(`Updated ${teamsUpdated} team records`);

    // Update cron_config last_run_at
    await supabase
      .from('cron_config')
      .update({ last_run_at: new Date().toISOString() })
      .eq('job_name', 'sync_nhl_stats');

    const duration = Date.now() - startTime;
    console.log(`=== NHL Stats Sync Complete in ${duration}ms ===`);
    console.log(`📊 Duos created: ${goalsWithAssist} goals with assists`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          gamesProcessed: allGames.length,
          goalsRecorded: playerStatsToInsert.length,
          goalsWithAssist,
          goalsWithoutAssist,
          teamsUpdated,
          durationMs: duration,
        }
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
