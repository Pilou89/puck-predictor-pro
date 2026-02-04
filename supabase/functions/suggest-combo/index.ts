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

    console.log('Generating AI Super Combo suggestions...');

    // Get today's date in Paris timezone
    const parisTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' });
    const now = new Date(parisTime);
    const fiveDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Season start
    const seasonStart = now.getMonth() >= 9 
      ? `${now.getFullYear()}-10-01` 
      : `${now.getFullYear() - 1}-10-01`;

    // Fetch recent player stats
    const { data: playerStats, error: statsError } = await supabase
      .from('player_stats')
      .select('scorer, team_abbr, situation, duo, assist1, assist2, game_date, match_name')
      .gte('game_date', fiveDaysAgo)
      .order('game_date', { ascending: false });

    if (statsError) {
      console.error('Error fetching player stats:', statsError);
      throw statsError;
    }

    // Fetch season stats for historical data
    const { data: seasonStats } = await supabase
      .from('player_stats')
      .select('scorer, team_abbr, match_name')
      .gte('game_date', seasonStart);

    // Build historical goals map
    const historicalGoals = new Map<string, Map<string, number>>();
    for (const stat of seasonStats || []) {
      const playerKey = stat.scorer.toLowerCase();
      const matchParts = stat.match_name.split(/\s+vs\s+|\s+@\s+/i);
      const opponent = matchParts.find((t: string) => t !== stat.team_abbr) || '';
      
      if (!historicalGoals.has(playerKey)) {
        historicalGoals.set(playerKey, new Map());
      }
      const playerHistory = historicalGoals.get(playerKey)!;
      playerHistory.set(opponent, (playerHistory.get(opponent) || 0) + 1);
    }

    // Aggregate player performance
    const playerPerformance = new Map<string, { 
      goals: number; 
      ppGoals: number; 
      team: string; 
      games: Set<string>;
      duo?: string;
      assists: number;
    }>();

    for (const stat of playerStats || []) {
      const key = stat.scorer;
      if (!playerPerformance.has(key)) {
        playerPerformance.set(key, { 
          goals: 0, 
          ppGoals: 0, 
          team: stat.team_abbr,
          games: new Set(),
          assists: 0
        });
      }
      const perf = playerPerformance.get(key)!;
      perf.goals++;
      perf.games.add(stat.game_date);
      if (stat.situation === 'PP') perf.ppGoals++;
      if (stat.duo) perf.duo = stat.duo;

      // Count assists too
      if (stat.assist1) {
        if (!playerPerformance.has(stat.assist1)) {
          playerPerformance.set(stat.assist1, { goals: 0, ppGoals: 0, team: stat.team_abbr, games: new Set(), assists: 0 });
        }
        playerPerformance.get(stat.assist1)!.assists++;
      }
      if (stat.assist2) {
        if (!playerPerformance.has(stat.assist2)) {
          playerPerformance.set(stat.assist2, { goals: 0, ppGoals: 0, team: stat.team_abbr, games: new Set(), assists: 0 });
        }
        playerPerformance.get(stat.assist2)!.assists++;
      }
    }

    // Get top performers (goals + assists for points)
    const topPerformers = Array.from(playerPerformance.entries())
      .map(([name, stats]) => ({
        name,
        team: stats.team,
        goals: stats.goals,
        ppGoals: stats.ppGoals,
        assists: stats.assists,
        points: stats.goals + stats.assists,
        gamesPlayed: stats.games.size,
        goalsPerGame: stats.games.size > 0 ? (stats.goals / stats.games.size).toFixed(2) : '0',
        duo: stats.duo,
      }))
      .filter(p => p.goals >= 1 || p.points >= 2)
      .sort((a, b) => b.points - a.points)
      .slice(0, 20);

    // Fetch H2H odds for tonight
    const { data: h2hOdds } = await supabase
      .from('winamax_odds')
      .select('selection, price, match_name, commence_time')
      .eq('market_type', 'h2h')
      .gte('commence_time', now.toISOString())
      .order('commence_time', { ascending: true });

    // Fetch team metadata
    const { data: teamMeta } = await supabase
      .from('team_meta')
      .select('team_abbr, team_name, pim_per_game, is_b2b');

    const teamMetaMap = new Map(teamMeta?.map(t => [t.team_abbr, t]) || []);

    // Get tonight's matches
    const tonightMatches = (h2hOdds || []).reduce((acc: any[], odd) => {
      if (!acc.find(m => m.match === odd.match_name)) {
        const parts = odd.match_name.split(/\s+vs\s+|\s+@\s+/i);
        const homeTeam = parts[0];
        const awayTeam = parts[1];
        const homeMeta = teamMetaMap.get(homeTeam);
        const awayMeta = teamMetaMap.get(awayTeam);
        
        acc.push({
          match: odd.match_name,
          time: odd.commence_time,
          homeTeam,
          awayTeam,
          homeB2B: homeMeta?.is_b2b || false,
          awayB2B: awayMeta?.is_b2b || false,
          homePIM: homeMeta?.pim_per_game || 7,
          awayPIM: awayMeta?.pim_per_game || 7,
        });
      }
      return acc;
    }, []);

    // Get relevant odds for teams
    const teamOdds = (h2hOdds || []).map(o => ({
      selection: o.selection,
      match: o.match_name,
      odds: o.price,
    }));

    // Build context for AI - enhanced with match data
    const playersContext = topPerformers.map(p => {
      const matchInfo = tonightMatches.find(m => m.homeTeam === p.team || m.awayTeam === p.team);
      if (!matchInfo) return null;
      
      const opponent = matchInfo.homeTeam === p.team ? matchInfo.awayTeam : matchInfo.homeTeam;
      const opponentB2B = matchInfo.homeTeam === p.team ? matchInfo.awayB2B : matchInfo.homeB2B;
      const opponentPIM = matchInfo.homeTeam === p.team ? matchInfo.awayPIM : matchInfo.homePIM;
      const playerHistory = historicalGoals.get(p.name.toLowerCase());
      const goalsVsOpponent = playerHistory?.get(opponent) || 0;

      return {
        ...p,
        match: matchInfo.match,
        matchTime: matchInfo.time,
        opponent,
        opponentB2B,
        opponentPIM,
        goalsVsOpponent,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    // Build AI prompt for Super Combo suggestions
    const comboPrompt = `Tu es un expert en paris sportifs NHL. Analyse les matchs de ce soir et propose des combinaisons système optimales.

## MATCHS DE CE SOIR:
${tonightMatches.map(m => 
  `- ${m.match} (${new Date(m.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
   Home B2B: ${m.homeB2B ? 'OUI 🔋' : 'Non'} | Away B2B: ${m.awayB2B ? 'OUI 🔋' : 'Non'}
   Home PIM: ${m.homePIM.toFixed(1)}/G | Away PIM: ${m.awayPIM.toFixed(1)}/G`
).join('\n')}

## COTES ÉQUIPES DISPONIBLES:
${teamOdds.map(o => `- ${o.selection}: @${o.odds.toFixed(2)} (${o.match})`).join('\n')}

## JOUEURS EN FORME (14 derniers jours):
${playersContext.map(p => 
  `- ${p.name} (${p.team}): ${p.goals} buts, ${p.points} pts en ${p.gamesPlayed} matchs${p.ppGoals > 0 ? `, ${p.ppGoals} PP` : ''}${p.duo ? `, duo ${p.duo}` : ''}
   Match: ${p.match} | Adversaire B2B: ${p.opponentB2B ? 'OUI 🔋' : 'Non'} | PIM adversaire: ${p.opponentPIM.toFixed(1)}/G${p.goalsVsOpponent > 0 ? ` | ⚡ ${p.goalsVsOpponent} but(s) vs ${p.opponent} cette saison` : ''}`
).join('\n')}

## CONSIGNES:
1. Propose 2-3 combinaisons système différentes:
   - Un système SAFE (2-3 sélections à cotes modérées 1.50-2.50, haute probabilité)
   - Un système FUN (3-4 sélections à cotes moyennes 2.00-4.00, bon équilibre)
   - Un système SUPER COMBO (3-5 sélections incluant des grosses cotes, gros gain potentiel)

2. Chaque combinaison doit inclure:
   - Des buteurs en forme
   - Optionnellement une équipe favorite ou underdog intéressant
   - Privilégier les adversaires en B2B ou indisciplinés

3. Pour chaque sélection, estime une cote réaliste (entre 1.50 et 8.00)

4. Calcule la cote combinée et propose un type de système (ex: Système 2/3)

Réponds en JSON avec ce format:
{
  "combos": [
    {
      "name": "Système SAFE 2/3",
      "type": "SAFE",
      "systemType": "2/3",
      "selections": [
        {
          "name": "Nikita Kucherov",
          "type": "player",
          "betType": "Buteur",
          "match": "TBL vs BOS",
          "estimatedOdds": 3.50,
          "reason": "En feu avec 4 buts en 5 matchs"
        }
      ],
      "combinedOdds": 12.25,
      "confidence": 70,
      "reasoning": "Combinaison solide basée sur..."
    }
  ],
  "analysis": "Résumé de l'analyse du soir en 2-3 phrases"
}`;

    console.log('Calling Lovable AI for combo suggestions...');

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
            content: 'Tu es un analyste expert en paris sportifs NHL. Tu crées des combinaisons système optimales. Tu réponds uniquement en JSON valide.' 
          },
          { role: 'user', content: comboPrompt }
        ],
        temperature: 0.4,
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

    console.log('AI Combo Response received:', aiContent?.substring(0, 300));

    // Parse AI response
    let comboResult;
    try {
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      comboResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI combo response:', parseError);
      comboResult = {
        combos: [],
        analysis: "L'analyse IA n'a pas pu être générée.",
        raw_response: aiContent
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: now.toISOString(),
        ...comboResult,
        context: {
          matchesTonight: tonightMatches.length,
          playersAnalyzed: playersContext.length,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Suggest Combo error:', error);
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
