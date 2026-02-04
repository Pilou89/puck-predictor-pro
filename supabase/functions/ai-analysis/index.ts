import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting AI analysis...');

    // Get today's date in Paris timezone
    const parisTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' });
    const now = new Date(parisTime);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch recent player stats (last 5 days)
    const { data: playerStats, error: statsError } = await supabase
      .from('player_stats')
      .select('scorer, team_abbr, situation, duo, game_date')
      .gte('game_date', fiveDaysAgo)
      .order('game_date', { ascending: false });

    if (statsError) {
      console.error('Error fetching player stats:', statsError);
      throw statsError;
    }

    // Aggregate player performance
    const playerPerformance = new Map<string, { 
      goals: number; 
      ppGoals: number; 
      team: string; 
      games: Set<string>;
      duo?: string;
    }>();

    for (const stat of playerStats || []) {
      const key = stat.scorer;
      if (!playerPerformance.has(key)) {
        playerPerformance.set(key, { 
          goals: 0, 
          ppGoals: 0, 
          team: stat.team_abbr,
          games: new Set()
        });
      }
      const perf = playerPerformance.get(key)!;
      perf.goals++;
      perf.games.add(stat.game_date);
      if (stat.situation === 'PP') perf.ppGoals++;
      if (stat.duo) perf.duo = stat.duo;
    }

    // Get top performers
    const topPerformers = Array.from(playerPerformance.entries())
      .map(([name, stats]) => ({
        name,
        team: stats.team,
        goals: stats.goals,
        ppGoals: stats.ppGoals,
        gamesPlayed: stats.games.size,
        goalsPerGame: (stats.goals / stats.games.size).toFixed(2),
        duo: stats.duo,
      }))
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 15);

    // Fetch current odds for goal scorers
    const { data: currentOdds, error: oddsError } = await supabase
      .from('winamax_odds')
      .select('selection, price, match_name, commence_time')
      .eq('market_type', 'player_anytime_goal_scorer')
      .order('fetched_at', { ascending: false });

    if (oddsError) {
      console.error('Error fetching odds:', oddsError);
      throw oddsError;
    }

    // Create odds map (latest odds per player)
    const oddsMap = new Map<string, { price: number; match: string; time: string }>();
    for (const odd of currentOdds || []) {
      const playerName = odd.selection.toLowerCase();
      if (!oddsMap.has(playerName)) {
        oddsMap.set(playerName, { 
          price: odd.price, 
          match: odd.match_name,
          time: odd.commence_time
        });
      }
    }

    // Fetch team metadata for context
    const { data: teamMeta } = await supabase
      .from('team_meta')
      .select('team_abbr, pim_per_game, is_b2b');

    const teamMetaMap = new Map(teamMeta?.map(t => [t.team_abbr, t]) || []);

    // Build context for AI
    const hotPlayersWithOdds = topPerformers.map(p => {
      const oddsInfo = oddsMap.get(p.name.toLowerCase());
      const teamInfo = teamMetaMap.get(p.team);
      return {
        ...p,
        currentOdds: oddsInfo?.price,
        matchTonight: oddsInfo?.match,
        opponentB2B: false, // Would need more logic to determine
        teamPIM: teamInfo?.pim_per_game,
      };
    }).filter(p => p.currentOdds); // Only players with odds available

    // Get upcoming matches for context
    const upcomingMatches = Array.from(new Set(
      currentOdds?.map(o => o.match_name) || []
    )).slice(0, 5);

    // Build the prompt for AI analysis
    const analysisPrompt = `Tu es un expert en paris sportifs NHL. Analyse ces données et identifie les 3 meilleures value bets pour les buteurs de ce soir.

## Joueurs en forme (5 derniers jours):
${hotPlayersWithOdds.map(p => 
  `- ${p.name} (${p.team}): ${p.goals} buts en ${p.gamesPlayed} matchs (${p.goalsPerGame}/match), ${p.ppGoals} en PP. Cote Winamax: ${p.currentOdds}${p.duo ? `, duo avec ${p.duo}` : ''}`
).join('\n')}

## Matchs de ce soir:
${upcomingMatches.join('\n')}

## Règles d'analyse:
1. Un joueur avec >0.5 but/match et une cote >2.5 est potentiellement une value bet
2. Les joueurs en PP sont favorisés contre les équipes indisciplinées (>8 PIM/match)
3. Les duos récurrents augmentent les chances de but
4. Évite les joueurs dont l'équipe adverse n'est PAS en B2B sauf si très en forme

Réponds en JSON avec exactement ce format:
{
  "picks": [
    {
      "player": "Nom du joueur",
      "team": "ABR",
      "match": "TEAM1 vs TEAM2",
      "odds": 2.50,
      "confidence": 75,
      "reasoning": "Explication courte en français"
    }
  ],
  "analysis_summary": "Résumé de l'analyse en 2-3 phrases"
}`;

    console.log('Calling Lovable AI Gateway...');

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { 
            role: 'system', 
            content: 'Tu es un analyste expert en paris sportifs NHL. Tu réponds uniquement en JSON valide.' 
          },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    console.log('AI Response received:', aiContent?.substring(0, 200));

    // Parse AI response
    let analysisResult;
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      analysisResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      analysisResult = {
        picks: [],
        analysis_summary: "L'analyse IA n'a pas pu être générée. Données insuffisantes.",
        raw_response: aiContent
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: now.toISOString(),
        analysis: analysisResult,
        dataContext: {
          playersAnalyzed: hotPlayersWithOdds.length,
          matchesTonight: upcomingMatches.length,
          statsWindow: '5 days',
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('AI Analysis error:', error);
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
