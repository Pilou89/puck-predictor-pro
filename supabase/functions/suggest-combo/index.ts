import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface PlayerComboSelection {
  name: string;
  team: string;
  match: string;
  betType: 'Buteur' | 'Point' | 'But+Passe';
  estimatedOdds: number;
  reason: string;
  learningScore: number;
}

interface AIPlayerCombo {
  name: string;
  type: 'SAFE' | 'FUN' | 'SUPER_COMBO';
  systemType: string;
  stakePerCombo: number;
  totalStake: number;
  selections: PlayerComboSelection[];
  combinationsCount: number;
  potentialGains: {
    min: number;
    max: number;
  };
  minRecoveryPercent?: number;
  confidence: number;
  reasoning: string;
}

// Calculate combinations (n choose k)
function combinations(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

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

    console.log('Generating AI Player Combo suggestions with learning...');

    // Get today's date in Paris timezone
    const parisTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' });
    const now = new Date(parisTime);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Season start
    const seasonStart = now.getMonth() >= 9 
      ? `${now.getFullYear()}-10-01` 
      : `${now.getFullYear() - 1}-10-01`;

    // Fetch recent player stats (14 days)
    const { data: playerStats, error: statsError } = await supabase
      .from('player_stats')
      .select('scorer, team_abbr, situation, duo, assist1, assist2, game_date, match_name')
      .gte('game_date', fourteenDaysAgo)
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

    // Fetch learning metrics for players
    const { data: learningMetrics } = await supabase
      .from('learning_metrics')
      .select('*')
      .order('wins', { ascending: false });

    // Build learning context for AI prompt
    const playerLearning = (learningMetrics || [])
      .filter(m => m.metric_type === 'player' && (m.total || 0) >= 2)
      .map(m => {
        const winRate = m.total ? Math.round((m.wins || 0) / m.total * 100) : 0;
        const adj = m.confidence_adjustment || 0;
        return `${m.metric_key}: ${winRate}% (${m.total} paris), ajust. ${adj > 0 ? '+' : ''}${adj}%`;
      })
      .slice(0, 15)
      .join('\n');

    const comboLearning = (learningMetrics || [])
      .filter(m => m.metric_type === 'context' && ['safe_bets', 'fun_bets', 'super_combo_bets'].includes(m.metric_key))
      .map(m => {
        const winRate = m.total ? Math.round((m.wins || 0) / m.total * 100) : 0;
        return `${m.metric_key}: ${winRate}% réussite (${m.total} paris), ROI: ${m.roi || 0}%`;
      })
      .join('\n');

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
      .slice(0, 25);

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

    if (playersContext.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          combos: [],
          analysis: "Aucun match trouvé ce soir ou données insuffisantes.",
          context: { matchesTonight: tonightMatches.length, playersAnalyzed: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Build AI prompt for 3 Player Combo suggestions
    const comboPrompt = `Tu es un expert en paris sportifs NHL. Analyse les matchs de ce soir et propose 3 combinaisons JOUEURS optimales.

## RÈGLES IMPORTANTES:
1. UNIQUEMENT des buteurs ou pointeurs (PAS d'équipes)
2. Chaque combo = sélections JOUEURS uniquement
3. Les cotes estimées doivent être réalistes (buteur ~2.50-4.50, point ~1.80-2.50)

## MATCHS DE CE SOIR:
${tonightMatches.map(m => 
  `- ${m.match} (${new Date(m.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
   Home B2B: ${m.homeB2B ? 'OUI 🔋' : 'Non'} | Away B2B: ${m.awayB2B ? 'OUI 🔋' : 'Non'}
   Home PIM: ${m.homePIM.toFixed(1)}/G | Away PIM: ${m.awayPIM.toFixed(1)}/G`
).join('\n')}

## JOUEURS EN FORME (14 derniers jours):
${playersContext.map(p => 
  `- ${p.name} (${p.team}): ${p.goals} buts, ${p.points} pts en ${p.gamesPlayed} matchs${p.ppGoals > 0 ? `, ${p.ppGoals} PP` : ''}${p.duo ? `, duo ${p.duo}` : ''}
   Match: ${p.match} | Adversaire B2B: ${p.opponentB2B ? 'OUI 🔋' : 'Non'} | PIM adversaire: ${p.opponentPIM.toFixed(1)}/G${p.goalsVsOpponent > 0 ? ` | ⚡ ${p.goalsVsOpponent} but(s) vs ${p.opponent} cette saison` : ''}`
).join('\n')}

## HISTORIQUE D'APPRENTISSAGE (favoriser les joueurs avec bon score):
${playerLearning || 'Pas encore de données d\'apprentissage'}

## PERFORMANCES COMBOS PASSÉS:
${comboLearning || 'Pas encore de données sur les combos'}

## 3 COMBINAISONS À PROPOSER:

### COMBO SAFE (récupération de mise) 🛡️
- Système 2/3 ou 2/4
- 3-4 joueurs avec cotes 2.00-3.00 (paris "Point marqué" ou "Buteur" sur joueurs réguliers)
- Objectif: Si 2 sélections passent, on récupère ~80% de la mise
- Privilégier joueurs réguliers, adversaires fatigués (B2B) ou indisciplinés (PIM élevé)

### COMBO FUN (équilibre) 🎲
- Système 2/4 ou 3/4  
- 3-4 joueurs avec cotes 2.50-4.00
- Bon ratio risque/gain
- Mix de valeurs sûres et d'outsiders intéressants

### SUPER COMBO (gros gains) 🎰
- Système 3/5 ou 4/5
- 4-5 joueurs avec cotes 3.50-6.00
- Joueurs en feu avec opportunités PP contre équipes indisciplinées
- Potentiel de gros gains

## CALCUL RÉCUPÉRATION MISE (SAFE):
Pour un système 2/3 avec mise 0.50€/combo (3 combos = 1.50€):
- Si 3/3 passent: Somme des gains de toutes les combinaisons gagnantes
- Si 2/3 passent: Gain = coteA * coteB * 0.50€
- Objectif SAFE: 2 sélections gagnantes = ~1.20€ (récup 80% de 1.50€)

Réponds en JSON avec ce format EXACT:
{
  "combos": [
    {
      "name": "Combo SAFE Joueurs 2/3",
      "type": "SAFE",
      "systemType": "2/3",
      "stakePerCombo": 0.50,
      "selections": [
        {
          "name": "Nikita Kucherov",
          "team": "TBL",
          "match": "TBL vs BOS",
          "betType": "Point",
          "estimatedOdds": 2.20,
          "reason": "4 pts en 3 matchs, adversaire en B2B",
          "learningScore": 0
        }
      ],
      "minRecoveryPercent": 80,
      "confidence": 75,
      "reasoning": "Combinaison sécurisée basée sur des joueurs réguliers..."
    },
    {
      "name": "Combo FUN Joueurs 2/4",
      "type": "FUN",
      "systemType": "2/4",
      "stakePerCombo": 0.25,
      "selections": [...],
      "confidence": 60,
      "reasoning": "..."
    },
    {
      "name": "Super Combo Joueurs 3/5",
      "type": "SUPER_COMBO",
      "systemType": "3/5",
      "stakePerCombo": 0.20,
      "selections": [...],
      "confidence": 40,
      "reasoning": "..."
    }
  ],
  "analysis": "Résumé de l'analyse du soir en 2-3 phrases"
}`;

    console.log('Calling Lovable AI for player combo suggestions...');

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
            content: 'Tu es un analyste expert en paris sportifs NHL. Tu crées des combinaisons système JOUEURS optimales. Tu réponds uniquement en JSON valide sans markdown.' 
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

    console.log('AI Combo Response received:', aiContent?.substring(0, 500));

    // Parse AI response
    let comboResult: { combos: AIPlayerCombo[], analysis: string };
    try {
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      // Clean up any remaining markdown
      jsonStr = jsonStr.replace(/```/g, '').trim();
      
      const parsed = JSON.parse(jsonStr);
      
      // Ensure combos have calculated values
      const combos = (parsed.combos || []).map((combo: any) => {
        const systemParts = combo.systemType.split('/');
        const required = parseInt(systemParts[0]) || 2;
        const total = parseInt(systemParts[1]) || combo.selections?.length || 3;
        const combinationsCount = combinations(total, required);
        const stakePerCombo = combo.stakePerCombo || 0.50;
        const totalStake = stakePerCombo * combinationsCount;

        // Calculate potential gains
        const allOdds = (combo.selections || []).map((s: any) => s.estimatedOdds || 2.0);
        
        // Min gain: minimum required selections winning with lowest odds combination
        let minGain = 0;
        if (allOdds.length >= required) {
          const sortedOdds = [...allOdds].sort((a, b) => a - b);
          const minComboOdds = sortedOdds.slice(0, required).reduce((acc, o) => acc * o, 1);
          minGain = stakePerCombo * minComboOdds;
        }

        // Max gain: all selections winning
        let maxGain = 0;
        if (allOdds.length >= required) {
          // Generate all combinations and sum their gains
          const generateCombos = (arr: number[], k: number): number[][] => {
            if (k === 0) return [[]];
            if (arr.length < k) return [];
            const [first, ...rest] = arr;
            const withFirst = generateCombos(rest, k - 1).map(c => [first, ...c]);
            const withoutFirst = generateCombos(rest, k);
            return [...withFirst, ...withoutFirst];
          };
          const allCombos = generateCombos(allOdds, required);
          maxGain = allCombos.reduce((sum, combo) => {
            const comboOdds = combo.reduce((acc, o) => acc * o, 1);
            return sum + (stakePerCombo * comboOdds);
          }, 0);
        }

        return {
          ...combo,
          combinationsCount,
          totalStake,
          stakePerCombo,
          potentialGains: {
            min: parseFloat(minGain.toFixed(2)),
            max: parseFloat(maxGain.toFixed(2)),
          }
        };
      });

      comboResult = {
        combos,
        analysis: parsed.analysis || "Analyse IA générée.",
      };
    } catch (parseError) {
      console.error('Failed to parse AI combo response:', parseError);
      console.error('Raw content:', aiContent);
      comboResult = {
        combos: [],
        analysis: "L'analyse IA n'a pas pu être générée correctement.",
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
          learningDataUsed: (learningMetrics?.length || 0) > 0,
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
