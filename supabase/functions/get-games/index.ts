import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Team mapping
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

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching upcoming games...');

    // Get today's date in Paris timezone
    const parisTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' });
    const now = new Date(parisTime);
    const in18Hours = new Date(now.getTime() + 18 * 60 * 60 * 1000);

    // Fetch upcoming games from NHL API
    const todayStr = now.toISOString().split('T')[0];
    const tomorrowStr = in18Hours.toISOString().split('T')[0];
    
    const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${todayStr}`;
    const response = await fetch(scheduleUrl);
    
    if (!response.ok) {
      throw new Error(`NHL API error: ${response.status}`);
    }

    const scheduleData = await response.json();
    
    // Also fetch tomorrow if needed
    let tomorrowData = null;
    if (todayStr !== tomorrowStr) {
      const tomorrowResponse = await fetch(`https://api-web.nhle.com/v1/schedule/${tomorrowStr}`);
      if (tomorrowResponse.ok) {
        tomorrowData = await tomorrowResponse.json();
      }
    }

    // Combine games
    const allGames: any[] = [];
    
    for (const dayData of scheduleData.gameWeek || []) {
      for (const game of dayData.games || []) {
        allGames.push(game);
      }
    }

    if (tomorrowData) {
      for (const dayData of tomorrowData.gameWeek || []) {
        for (const game of dayData.games || []) {
          allGames.push(game);
        }
      }
    }

    // Filter games within 18 hours
    const upcomingGames = allGames.filter(game => {
      const gameTime = new Date(game.startTimeUTC);
      return gameTime >= now && gameTime <= in18Hours && 
             (game.gameState === 'FUT' || game.gameState === 'PRE' || game.gameState === 'LIVE');
    });

    console.log(`Found ${upcomingGames.length} games in next 18 hours`);

    // Fetch team metadata for badges
    const { data: teamMeta } = await supabase
      .from('team_meta')
      .select('*');

    const teamMetaMap = new Map(teamMeta?.map(t => [t.team_abbr, t]) || []);

    // Fetch hot players (top scorers in last 5 games)
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const { data: recentGoals } = await supabase
      .from('player_stats')
      .select('scorer, team_abbr, situation, duo')
      .gte('game_date', fiveDaysAgo);

    // Aggregate player stats
    const playerStats = new Map<string, { goals: number; ppGoals: number; team: string; duo?: string }>();
    
    for (const goal of recentGoals || []) {
      const key = goal.scorer;
      if (!playerStats.has(key)) {
        playerStats.set(key, { goals: 0, ppGoals: 0, team: goal.team_abbr });
      }
      const stats = playerStats.get(key)!;
      stats.goals++;
      if (goal.situation === 'PP') stats.ppGoals++;
      if (goal.duo) stats.duo = goal.duo;
    }

    // Get top 10 hot players
    const hotPlayers = Array.from(playerStats.entries())
      .sort((a, b) => b[1].goals - a[1].goals)
      .slice(0, 10)
      .map(([name, stats]) => ({
        name,
        team: stats.team,
        goals: stats.goals,
        ppGoals: stats.ppGoals,
        duo: stats.duo,
      }));

    // Fetch current odds for hot players
    const { data: currentOdds } = await supabase
      .from('winamax_odds')
      .select('selection, price')
      .eq('market_type', 'player_anytime_goal_scorer')
      .order('fetched_at', { ascending: false });

    const oddsMap = new Map(currentOdds?.map(o => [o.selection.toLowerCase(), o.price]) || []);

    // Format response
    const games = upcomingGames.map(game => {
      const homeAbbr = game.homeTeam?.abbrev || '';
      const awayAbbr = game.awayTeam?.abbrev || '';
      const homeMeta = teamMetaMap.get(homeAbbr);
      const awayMeta = teamMetaMap.get(awayAbbr);

      // Determine badges
      const homeBadges: string[] = [];
      const awayBadges: string[] = [];

      if (homeMeta?.is_b2b) homeBadges.push('btb');
      if (awayMeta?.is_b2b) awayBadges.push('btb');
      if (homeMeta?.pim_per_game && homeMeta.pim_per_game > 8) homeBadges.push('discipline');
      if (awayMeta?.pim_per_game && awayMeta.pim_per_game > 8) awayBadges.push('discipline');

      return {
        id: game.id,
        startTime: game.startTimeUTC,
        venue: game.venue?.default,
        status: game.gameState === 'LIVE' ? 'live' : 'scheduled',
        homeTeam: {
          abbr: homeAbbr,
          name: TEAM_MAPPING[homeAbbr] || homeAbbr,
          isB2B: homeMeta?.is_b2b || false,
          pimPerGame: homeMeta?.pim_per_game || 0,
        },
        awayTeam: {
          abbr: awayAbbr,
          name: TEAM_MAPPING[awayAbbr] || awayAbbr,
          isB2B: awayMeta?.is_b2b || false,
          pimPerGame: awayMeta?.pim_per_game || 0,
        },
        badges: {
          home: homeBadges,
          away: awayBadges,
        },
      };
    });

    // Add odds to hot players
    const hotPlayersWithOdds = hotPlayers.map(p => ({
      ...p,
      currentOdds: oddsMap.get(p.name.toLowerCase()),
    }));

    // Fetch prediction stats
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const { data: predictions } = await supabase
      .from('prediction_history')
      .select('outcome_win, predicted_odds')
      .gte('prediction_date', thirtyDaysAgo)
      .not('outcome_win', 'is', null);

    let totalPredictions = predictions?.length || 0;
    let wins = predictions?.filter(p => p.outcome_win).length || 0;
    let roi = 0;

    if (totalPredictions > 0) {
      // Calculate ROI: (sum of returns - total stakes) / total stakes
      const totalStakes = totalPredictions; // Assuming 1 unit per bet
      const returns = predictions?.reduce((sum, p) => {
        return sum + (p.outcome_win ? p.predicted_odds : 0);
      }, 0) || 0;
      roi = ((returns - totalStakes) / totalStakes) * 100;
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: now.toISOString(),
        timezone: 'Europe/Paris',
        games,
        hotPlayers: hotPlayersWithOdds,
        stats: {
          totalPredictions,
          wins,
          losses: totalPredictions - wins,
          winRate: totalPredictions > 0 ? wins / totalPredictions : 0,
          roi: parseFloat(roi.toFixed(1)),
        },
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Get games error:', error);
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
