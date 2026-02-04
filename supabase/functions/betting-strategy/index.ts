import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Bet types configuration
const BET_TYPES = {
  H2H: { name: 'Victoire Finale', description: 'Incluant prolongation et TAB' },
  GOAL_SCORER: { name: 'Buteur Simple', description: 'Mise sur un joueur spécifique' },
  DUO: { name: 'Duo Buteur/Points', description: 'Combiné buteur + assistant' },
  POINTS_SOLO: { name: 'Points Solo', description: 'Over/Under points joueur' },
};

// Stake levels
const STAKES = {
  LOTO: { amount: 0.50, label: '🎰 Loto', minOdds: 4.0 },
  MEDIUM: { amount: 1.00, label: '⚖️ Équilibré', minOdds: 2.0, maxOdds: 4.0 },
  SECURITY: { amount: 2.00, label: '🛡️ Sécurité', maxOdds: 2.0 },
  SUPER_COMBO: { amount: 3.00, label: '💎 Super Combo', minConfidence: 85 },
};

interface BetProposal {
  id: string;
  type: keyof typeof BET_TYPES;
  selection: string;
  match: string;
  odds: number;
  confidence: number;
  stake: number;
  stakeLabel: string;
  potentialGain: number;
  netGain: number;
  reasoning: string;
  coverageLevel?: string;
  coveredBy?: string;
}

interface StrategyPlan {
  timestamp: string;
  totalStake: number;
  totalPotentialGain: number;
  coverageRatio: number;
  bets: BetProposal[];
  summary: string;
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

    console.log('Starting betting strategy analysis...');

    const parisTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' });
    const now = new Date(parisTime);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const seasonStart = now.getMonth() >= 9 
      ? `${now.getFullYear()}-10-01` 
      : `${now.getFullYear() - 1}-10-01`;

    // Fetch all current odds
    const { data: allOdds, error: oddsError } = await supabase
      .from('winamax_odds')
      .select('*')
      .order('fetched_at', { ascending: false });

    if (oddsError) throw oddsError;

    // Group odds by market type
    const h2hOdds = allOdds?.filter(o => o.market_type === 'h2h') || [];
    const goalScorerOdds = allOdds?.filter(o => o.market_type === 'player_anytime_goal_scorer') || [];
    const pointsOdds = allOdds?.filter(o => o.market_type === 'player_points') || [];

    // Fetch player stats
    const { data: playerStats } = await supabase
      .from('player_stats')
      .select('*')
      .gte('game_date', fiveDaysAgo);

    // Fetch season stats for historical data
    const { data: seasonStats } = await supabase
      .from('player_stats')
      .select('scorer, team_abbr, match_name, duo')
      .gte('game_date', seasonStart);

    // Fetch team metadata
    const { data: teamMeta } = await supabase
      .from('team_meta')
      .select('*');

    const teamMetaMap = new Map(teamMeta?.map(t => [t.team_abbr, t]) || []);

    // Aggregate player performance
    const playerPerf = new Map<string, { goals: number; ppGoals: number; team: string; games: number; duo?: string }>();
    for (const stat of playerStats || []) {
      const key = stat.scorer.toLowerCase();
      if (!playerPerf.has(key)) {
        playerPerf.set(key, { goals: 0, ppGoals: 0, team: stat.team_abbr, games: 0 });
      }
      const p = playerPerf.get(key)!;
      p.goals++;
      if (stat.situation === 'PP') p.ppGoals++;
      if (stat.duo) p.duo = stat.duo;
    }

    // Count unique games per player
    const gamesByPlayer = new Map<string, Set<string>>();
    for (const stat of playerStats || []) {
      const key = stat.scorer.toLowerCase();
      if (!gamesByPlayer.has(key)) gamesByPlayer.set(key, new Set());
      gamesByPlayer.get(key)!.add(stat.game_date);
    }
    for (const [key, games] of gamesByPlayer) {
      const p = playerPerf.get(key);
      if (p) p.games = games.size;
    }

    // Build duo stats
    const duoStats = new Map<string, { count: number; players: string[] }>();
    for (const stat of seasonStats || []) {
      if (stat.duo) {
        const duoKey = stat.duo.toLowerCase();
        if (!duoStats.has(duoKey)) {
          duoStats.set(duoKey, { count: 0, players: stat.duo.split('+') });
        }
        duoStats.get(duoKey)!.count++;
      }
    }

    // Historical goals against opponents
    const historicalGoals = new Map<string, Map<string, number>>();
    for (const stat of seasonStats || []) {
      const playerKey = stat.scorer.toLowerCase();
      const matchParts = stat.match_name.split(/\s+vs\s+|\s+@\s+/i);
      const opponent = matchParts.find((t: string) => t !== stat.team_abbr) || '';
      if (!historicalGoals.has(playerKey)) historicalGoals.set(playerKey, new Map());
      const h = historicalGoals.get(playerKey)!;
      h.set(opponent, (h.get(opponent) || 0) + 1);
    }

    // Build AI prompt with all data
    const topGoalScorers = goalScorerOdds
      .filter(o => o.price >= 1.70)
      .slice(0, 20)
      .map(o => {
        const perf = playerPerf.get(o.selection.toLowerCase());
        const matchParts = o.match_name.split(/\s+vs\s+|\s+@\s+/i);
        const playerTeam = perf?.team || matchParts[0];
        const opponent = matchParts.find((t: string) => t !== playerTeam) || matchParts[1];
        const opponentMeta = teamMetaMap.get(opponent);
        const history = historicalGoals.get(o.selection.toLowerCase())?.get(opponent) || 0;
        
        return {
          player: o.selection,
          match: o.match_name,
          odds: o.price,
          goals5: perf?.goals || 0,
          games5: perf?.games || 1,
          ppGoals: perf?.ppGoals || 0,
          duo: perf?.duo,
          opponentB2B: opponentMeta?.is_b2b || false,
          opponentPIM: opponentMeta?.pim_per_game || 0,
          historyVsOpponent: history,
        };
      });

    const topH2H = h2hOdds
      .filter(o => o.price >= 1.30 && o.price <= 3.50)
      .slice(0, 10)
      .map(o => {
        const matchParts = o.match_name.split(/\s+vs\s+|\s+@\s+/i);
        const selectedTeam = o.selection;
        const opponent = matchParts.find((t: string) => t !== selectedTeam) || '';
        const opponentMeta = teamMetaMap.get(opponent);
        const teamData = teamMetaMap.get(selectedTeam);
        
        return {
          selection: o.selection,
          match: o.match_name,
          odds: o.price,
          opponentB2B: opponentMeta?.is_b2b || false,
          opponentPIM: opponentMeta?.pim_per_game || 0,
          teamB2B: teamData?.is_b2b || false,
        };
      });

    const topDuos = Array.from(duoStats.entries())
      .filter(([_, d]) => d.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([duo, data]) => ({ duo, connections: data.count, players: data.players }));

    const strategyPrompt = `Tu es un expert en stratégie de paris NHL. Génère un PLAN DE MISE STRATÉGIQUE pour ce soir.

## DONNÉES DISPONIBLES

### Cotes Buteurs (filtrées ≥1.70):
${topGoalScorers.map(p => 
  `- ${p.player}: @${p.odds.toFixed(2)} | ${p.goals5}G en ${p.games5}M (${(p.goals5/p.games5).toFixed(2)}/M) | PP:${p.ppGoals}${p.opponentB2B ? ' 🔋B2B' : ''}${p.opponentPIM > 8 ? ` 🔴PIM:${p.opponentPIM.toFixed(1)}` : ''}${p.historyVsOpponent > 0 ? ` ⚡${p.historyVsOpponent}G vs adversaire` : ''}${p.duo ? ` | Duo:${p.duo}` : ''}`
).join('\n')}

### Cotes H2H (victoire finale):
${topH2H.map(h => 
  `- ${h.selection} @${h.odds.toFixed(2)} (${h.match})${h.opponentB2B ? ' 🔋Adv. en B2B' : ''}${h.teamB2B ? ' ⚠️En B2B' : ''}`
).join('\n')}

### Duos Performants (saison):
${topDuos.map(d => `- ${d.duo}: ${d.connections} connexions`).join('\n')}

## RÈGLES STRICTES DE STRATÉGIE

### Types de Paris Autorisés:
1. **H2H**: Victoire finale (prolongation/TAB inclus)
2. **GOAL_SCORER**: Buteur simple
3. **DUO**: Combiné buteur + assistant
4. **POINTS_SOLO**: Over/Under points joueur

### Logique de Mise (CRITIQUE):
- **LOTO** (🎰): Cote ≥4.00, mise 0.50€
- **ÉQUILIBRÉ** (⚖️): Cote 2.00-3.99, mise 1.00€
- **SÉCURITÉ** (🛡️): Cote <2.00, mise 2.00€
- **SUPER COMBO** (💎): UNIQUEMENT si confiance >85%, mise 3.00€

### Règle de Couverture OBLIGATOIRE:
Pour chaque pari LOTO, tu DOIS proposer un pari SÉCURITÉ dont le gain potentiel couvre la perte du LOTO.
Exemple: LOTO 0.50€ perdu → SÉCURITÉ doit rapporter minimum +0.50€ net.

### Calcul du Score de Confiance:
- Base: 50%
- +15% si adversaire en B2B
- +10% si >0.6 but/match
- +10% si adversaire >8 PIM/G
- +5% si duo performant
- +5% si historique positif vs adversaire
- -10% si équipe en B2B
- Max: 95%

## FORMAT DE RÉPONSE JSON

{
  "bets": [
    {
      "id": "bet-1",
      "type": "GOAL_SCORER",
      "selection": "Nom Joueur",
      "match": "TOR vs MTL",
      "odds": 2.50,
      "confidence": 75,
      "stake": 1.00,
      "stakeLabel": "⚖️ Équilibré",
      "reasoning": "Explication courte incluant les facteurs clés",
      "coveredBy": "bet-2"
    },
    {
      "id": "bet-2",
      "type": "H2H",
      "selection": "TOR",
      "match": "TOR vs MTL",
      "odds": 1.65,
      "confidence": 70,
      "stake": 2.00,
      "stakeLabel": "🛡️ Sécurité",
      "reasoning": "Pari de couverture pour bet-1"
    }
  ],
  "summary": "Résumé de la stratégie de la nuit en 2-3 phrases"
}

Génère entre 4 et 8 paris avec une stratégie équilibrée. Assure-toi que chaque LOTO a sa SÉCURITÉ.`;

    console.log('Calling Lovable AI for strategy...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Tu es un stratège expert en paris sportifs NHL. Tu réponds UNIQUEMENT en JSON valide.' },
          { role: 'user', content: strategyPrompt }
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
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    console.log('AI Strategy received');

    // Parse AI response
    let strategyResult;
    try {
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      strategyResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      strategyResult = { bets: [], summary: "Erreur d'analyse. Données insuffisantes." };
    }

    // Calculate totals and coverage
    const bets: BetProposal[] = (strategyResult.bets || []).map((bet: any) => {
      const potentialGain = bet.stake * bet.odds;
      const netGain = potentialGain - bet.stake;
      return {
        ...bet,
        potentialGain: parseFloat(potentialGain.toFixed(2)),
        netGain: parseFloat(netGain.toFixed(2)),
      };
    });

    const totalStake = bets.reduce((sum, b) => sum + b.stake, 0);
    const totalPotentialGain = bets.reduce((sum, b) => sum + b.potentialGain, 0);
    
    // Calculate coverage ratio (security bets gains vs loto losses)
    const lotoBets = bets.filter(b => b.stakeLabel?.includes('Loto'));
    const securityBets = bets.filter(b => b.stakeLabel?.includes('Sécurité'));
    const lotoRisk = lotoBets.reduce((sum, b) => sum + b.stake, 0);
    const securityGain = securityBets.reduce((sum, b) => sum + b.netGain, 0);
    const coverageRatio = lotoRisk > 0 ? (securityGain / lotoRisk) * 100 : 100;

    const plan: StrategyPlan = {
      timestamp: now.toISOString(),
      totalStake: parseFloat(totalStake.toFixed(2)),
      totalPotentialGain: parseFloat(totalPotentialGain.toFixed(2)),
      coverageRatio: parseFloat(coverageRatio.toFixed(0)),
      bets,
      summary: strategyResult.summary || "Plan de mise généré avec succès.",
    };

    return new Response(
      JSON.stringify({ success: true, plan }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Betting strategy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
