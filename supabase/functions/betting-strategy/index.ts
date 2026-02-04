import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Basket bet types configuration
const BASKET_TYPES = {
  SAFE: { 
    name: 'SAFE', 
    emoji: '🛡️',
    description: 'Pari simple à haute confiance', 
    minConfidence: 85,
    allowedTypes: ['H2H', 'POINTS_SOLO'],
    stake: 2.00,
  },
  DUO: { 
    name: 'DUO', 
    emoji: '👥',
    description: 'Pari basé sur les duos performants', 
    minOdds: 3.00,
    maxOdds: 5.00,
    allowedTypes: ['DUO', 'GOAL_SCORER'],
    stake: 1.00,
  },
  FUN: { 
    name: 'FUN', 
    emoji: '🎰',
    description: 'Pari à grosse cote pour le fun',
    minOdds: 4.00,
    allowedTypes: ['GOAL_SCORER', 'DUO'],
    stake: 0.50,
  },
};

interface BasketBet {
  id: string;
  basketType: 'SAFE' | 'DUO' | 'FUN';
  type: string;
  selection: string;
  match: string;
  odds: number;
  confidence: number;
  stake: number;
  potentialGain: number;
  netGain: number;
  reasoning: string;
}

interface EveningBasket {
  timestamp: string;
  totalStake: number;
  totalPotentialGain: number;
  isCovered: boolean;
  coverageDetails: string;
  safe: BasketBet | null;
  duo: BasketBet | null;
  fun: BasketBet | null;
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

    console.log('Starting evening basket generation...');

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

    // Fetch season stats for duo data
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

    // Build duo stats from season data
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

    // Build data for AI prompt
    const topGoalScorers = goalScorerOdds
      .filter(o => o.price >= 1.70)
      .slice(0, 20)
      .map(o => {
        const perf = playerPerf.get(o.selection.toLowerCase());
        const matchParts = o.match_name.split(/\s+vs\s+|\s+@\s+/i);
        const playerTeam = perf?.team || matchParts[0];
        const opponent = matchParts.find((t: string) => t !== playerTeam) || matchParts[1];
        const opponentMeta = teamMetaMap.get(opponent);
        
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
        };
      });

    const topH2H = h2hOdds
      .filter(o => o.price >= 1.30 && o.price <= 2.50)
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
          teamB2B: teamData?.is_b2b || false,
        };
      });

    const topDuos = Array.from(duoStats.entries())
      .filter(([_, d]) => d.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([duo, data]) => ({ duo, connections: data.count, players: data.players }));

    // Build prompt for AI
    const basketPrompt = `Tu es un expert en stratégie de paris NHL. Génère LE PANIER DU SOIR avec exactement 3 paris distincts.

## DONNÉES DISPONIBLES

### Cotes Victoire (H2H) pour le bloc SAFE:
${topH2H.map(h => 
  `- ${h.selection} @${h.odds.toFixed(2)} (${h.match})${h.opponentB2B ? ' 🔋Adv. B2B' : ''}${h.teamB2B ? ' ⚠️En B2B' : ''}`
).join('\n')}

### Buteurs pour les blocs DUO et FUN:
${topGoalScorers.map(p => 
  `- ${p.player}: @${p.odds.toFixed(2)} | ${p.goals5}G en ${p.games5}M${p.opponentB2B ? ' 🔋B2B' : ''}${p.duo ? ` | Duo:${p.duo}` : ''}`
).join('\n')}

### Duos Performants (depuis le début de saison):
${topDuos.map(d => `- ${d.duo}: ${d.connections} connexions cette saison`).join('\n')}

## RÈGLES STRICTES DU PANIER

### BLOC SAFE (🛡️ Sécurité):
- Type autorisé: H2H (victoire) ou POINTS_SOLO
- Confiance OBLIGATOIRE > 85%
- Mise fixe: 2.00€
- Critères de sélection: équipe favorite, adversaire en B2B, ou équipe avec momentum

### BLOC DUO (👥 Duo):
- Type: DUO ou GOAL_SCORER d'un joueur membre d'un duo performant
- Cote OBLIGATOIRE entre 3.00 et 5.00
- Mise fixe: 1.00€
- Doit s'appuyer sur les duos listés ci-dessus

### BLOC FUN (🎰 Loto):
- Type: GOAL_SCORER avec grosse cote ou pari risqué
- Cote minimum: 4.00
- Mise fixe: 0.50€
- Rechercher les opportunités (B2B adversaire, joueur en forme)

### CALCUL DE COUVERTURE CRITIQUE:
Le gain net potentiel du SAFE doit couvrir la perte des mises DUO + FUN.
Formule: (SAFE.odds × 2.00) - 2.00 >= 1.00 + 0.50
Donc SAFE.odds >= 1.75 minimum pour couvrir les pertes.

### Calcul du Score de Confiance:
- Base: 50%
- +20% si adversaire en B2B
- +10% si >0.6 but/match sur 5 derniers
- +10% si duo performant (>3 connexions)
- -10% si équipe en B2B
- Max: 95%

## FORMAT DE RÉPONSE JSON STRICT

{
  "safe": {
    "id": "safe-1",
    "type": "H2H",
    "selection": "Nom Équipe",
    "match": "TOR vs MTL",
    "odds": 1.85,
    "confidence": 88,
    "reasoning": "Explication courte"
  },
  "duo": {
    "id": "duo-1",
    "type": "GOAL_SCORER",
    "selection": "Nom Joueur",
    "match": "TOR vs MTL",
    "odds": 3.50,
    "confidence": 65,
    "reasoning": "Membre du duo X+Y (N connexions)"
  },
  "fun": {
    "id": "fun-1",
    "type": "GOAL_SCORER",
    "selection": "Nom Joueur",
    "match": "TOR vs MTL",
    "odds": 5.00,
    "confidence": 45,
    "reasoning": "Opportunité loto: adversaire en B2B"
  },
  "summary": "Résumé du panier en 1-2 phrases"
}

Génère exactement 3 paris. Si les données ne permettent pas un bloc, mets null.`;

    console.log('Calling Lovable AI for basket...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Tu es un stratège expert en paris sportifs NHL. Tu réponds UNIQUEMENT en JSON valide sans markdown.' },
          { role: 'user', content: basketPrompt }
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

    console.log('AI Basket received');

    // Parse AI response
    let basketResult;
    try {
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      // Also try to extract from code blocks without json specifier
      const codeMatch = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch) jsonStr = codeMatch[1];
      // Clean up any remaining markdown
      jsonStr = jsonStr.replace(/```/g, '').trim();
      basketResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError, 'Content:', aiContent);
      basketResult = { safe: null, duo: null, fun: null, summary: "Erreur d'analyse. Données insuffisantes." };
    }

    // Build the basket with calculated values
    const buildBet = (bet: any, basketType: 'SAFE' | 'DUO' | 'FUN'): BasketBet | null => {
      if (!bet) return null;
      const config = BASKET_TYPES[basketType];
      const potentialGain = config.stake * bet.odds;
      const netGain = potentialGain - config.stake;
      return {
        id: bet.id || `${basketType.toLowerCase()}-1`,
        basketType,
        type: bet.type,
        selection: bet.selection,
        match: bet.match,
        odds: bet.odds,
        confidence: bet.confidence,
        stake: config.stake,
        potentialGain: parseFloat(potentialGain.toFixed(2)),
        netGain: parseFloat(netGain.toFixed(2)),
        reasoning: bet.reasoning,
      };
    };

    const safe = buildBet(basketResult.safe, 'SAFE');
    const duo = buildBet(basketResult.duo, 'DUO');
    const fun = buildBet(basketResult.fun, 'FUN');

    // Calculate totals
    const totalStake = (safe?.stake || 0) + (duo?.stake || 0) + (fun?.stake || 0);
    const totalPotentialGain = (safe?.potentialGain || 0) + (duo?.potentialGain || 0) + (fun?.potentialGain || 0);

    // Coverage calculation: SAFE net gain must cover DUO + FUN stakes
    const safeNetGain = safe?.netGain || 0;
    const riskStake = (duo?.stake || 0) + (fun?.stake || 0);
    const isCovered = safeNetGain >= riskStake;
    const coverageDetails = isCovered 
      ? `Le gain SAFE (+${safeNetGain.toFixed(2)}€) couvre les mises à risque (${riskStake.toFixed(2)}€)`
      : `Attention: gain SAFE (+${safeNetGain.toFixed(2)}€) < mises à risque (${riskStake.toFixed(2)}€)`;

    const basket: EveningBasket = {
      timestamp: now.toISOString(),
      totalStake: parseFloat(totalStake.toFixed(2)),
      totalPotentialGain: parseFloat(totalPotentialGain.toFixed(2)),
      isCovered,
      coverageDetails,
      safe,
      duo,
      fun,
      summary: basketResult.summary || "Panier du soir généré avec succès.",
    };

    return new Response(
      JSON.stringify({ success: true, basket }),
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
