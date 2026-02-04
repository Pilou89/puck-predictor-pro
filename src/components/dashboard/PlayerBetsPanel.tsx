import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  User, 
  Shield, 
  Zap, 
  RefreshCw, 
  AlertCircle,
  Sparkles,
  Target,
  DollarSign,
  Brain,
  Trophy,
  Calculator
} from "lucide-react";
import { toast } from "sonner";
import { useBankroll } from "@/hooks/useBankroll";

interface PlayerSuggestion {
  id: string;
  name: string;
  team: string;
  match: string;
  matchTime: string;
  goalsLast14: number;
  ppGoals: number;
  confidence: number;
  reasoning: string;
  category: 'SAFE' | 'FUN' | 'SUPER_COMBO';
  learningBoost: number;
  // User input
  manualOdds?: number;
}

interface SuperComboPlayer {
  selections: (PlayerSuggestion & { odds: number; betType: string })[];
  systemType: string;
  combinationsCount: number;
  stakePerCombo: number;
  potentialGain: { min: number; max: number };
  minRecoveryPercent: number;
}

function combinations(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

export function PlayerBetsPanel() {
  const { addBet, isUpdating } = useBankroll();
  
  const [players, setPlayers] = useState<PlayerSuggestion[]>([]);
  const [oddsInputs, setOddsInputs] = useState<Record<string, { odds: string; betType: 'Buteur' | 'Point' }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stakePerCombo, setStakePerCombo] = useState(0.25);
  const [isPlacing, setIsPlacing] = useState<string | null>(null);

  const fetchPlayerSuggestions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch learning metrics for players
      const { data: metrics } = await supabase
        .from('learning_metrics')
        .select('*')
        .eq('metric_type', 'player');
      
      const boosts = new Map<string, number>();
      metrics?.forEach(m => {
        boosts.set(m.metric_key.toLowerCase(), m.confidence_adjustment || 0);
      });

      // Fetch recent player stats (14 days)
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      const { data: recentGoals, error: goalsError } = await supabase
        .from('player_stats')
        .select('*')
        .gte('game_date', fourteenDaysAgo.toISOString().split('T')[0])
        .order('game_date', { ascending: false });

      if (goalsError) throw goalsError;

      // Fetch team metadata
      const { data: teamMeta } = await supabase
        .from('team_meta')
        .select('*');

      const teamMetaMap = new Map(teamMeta?.map(t => [t.team_abbr, t]) || []);

      // Fetch tonight's matches
      const { data: tonightOdds } = await supabase
        .from('winamax_odds')
        .select('*')
        .eq('market_type', 'h2h')
        .gte('commence_time', new Date().toISOString())
        .order('commence_time', { ascending: true })
        .limit(20);

      const tonightTeams = new Set<string>();
      const tonightMatches: Record<string, { match: string; time: string }> = {};
      
      (tonightOdds || []).forEach(o => {
        const teams = extractTeamsFromMatch(o.match_name);
        teams.forEach(t => {
          tonightTeams.add(t);
          tonightMatches[t] = { match: o.match_name, time: o.commence_time };
        });
      });

      // Aggregate player performance
      const playerStatsMap = new Map<string, {
        goals: number;
        ppGoals: number;
        team: string;
        games: Set<string>;
      }>();

      (recentGoals || []).forEach(g => {
        const key = g.scorer;
        const existing = playerStatsMap.get(key) || { 
          goals: 0, 
          ppGoals: 0, 
          team: g.team_abbr,
          games: new Set() 
        };
        
        existing.goals++;
        if (g.situation === 'PP') existing.ppGoals++;
        existing.games.add(g.game_date);
        
        playerStatsMap.set(key, existing);
      });

      // Build player suggestions
      const suggestions: PlayerSuggestion[] = [];
      
      playerStatsMap.forEach((stats, playerName) => {
        if (!tonightTeams.has(stats.team)) return;
        
        const matchInfo = tonightMatches[stats.team];
        if (!matchInfo) return;

        const opponentAbbr = getOpponentAbbr(matchInfo.match, stats.team);
        const opponentMeta = teamMetaMap.get(opponentAbbr);
        const playerBoost = boosts.get(playerName.toLowerCase()) || 0;

        let confidence = 50 + playerBoost;
        const reasons: string[] = [];

        if (stats.goals >= 4) {
          confidence += 25;
          reasons.push(`🔥 ${stats.goals} buts`);
        } else if (stats.goals >= 2) {
          confidence += 15;
          reasons.push(`${stats.goals} buts`);
        }

        if (stats.ppGoals >= 2 && opponentMeta?.pim_per_game && opponentMeta.pim_per_game >= 8) {
          confidence += 20;
          reasons.push(`PP opp: ${opponentMeta.pim_per_game.toFixed(1)} PIM/G`);
        } else if (stats.ppGoals >= 1) {
          confidence += 10;
          reasons.push(`${stats.ppGoals} PP`);
        }

        if (opponentMeta?.is_b2b) {
          confidence += 15;
          reasons.push("Adv. B2B 🔋");
        }

        if (playerBoost > 0) {
          reasons.push(`📈 +${playerBoost}%`);
        } else if (playerBoost < 0) {
          reasons.push(`📉 ${playerBoost}%`);
        }

        confidence = Math.min(confidence, 95);

        let category: 'SAFE' | 'FUN' | 'SUPER_COMBO' = 'FUN';
        if (confidence >= 80) category = 'SAFE';
        else if (confidence < 60) category = 'SUPER_COMBO';

        suggestions.push({
          id: `player-${playerName.replace(/\s+/g, '-').toLowerCase()}`,
          name: playerName,
          team: stats.team,
          match: matchInfo.match,
          matchTime: matchInfo.time,
          goalsLast14: stats.goals,
          ppGoals: stats.ppGoals,
          confidence,
          reasoning: reasons.join(' • ') || 'Actif récemment',
          category,
          learningBoost: playerBoost,
        });
      });

      suggestions.sort((a, b) => b.confidence - a.confidence);
      setPlayers(suggestions.slice(0, 12));
      toast.success('Suggestions joueurs mises à jour');
    } catch (err) {
      console.error('Player suggestions error:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerSuggestions();
  }, []);

  const safePlayers = players.filter(p => p.category === 'SAFE').slice(0, 3);
  const funPlayers = players.filter(p => p.category === 'FUN').slice(0, 3);

  // Get players with entered odds for super combo
  const playersWithOdds = useMemo(() => {
    return players.map(p => {
      const input = oddsInputs[p.id];
      if (!input || !input.odds) return null;
      const odds = parseFloat(input.odds);
      if (isNaN(odds) || odds <= 1) return null;
      return { ...p, odds, betType: input.betType };
    }).filter((p): p is NonNullable<typeof p> => p !== null);
  }, [players, oddsInputs]);

  // Super Combo: système sur les joueurs avec cotes saisies
  const superCombo = useMemo<SuperComboPlayer | null>(() => {
    if (playersWithOdds.length < 4) return null;
    
    const selections = playersWithOdds.slice(0, 5); // Max 5
    const total = selections.length;
    const required = Math.max(3, total - 1); // Au moins 3 gagnants
    const systemType = `${required}/${total}`;
    const combosCount = combinations(total, required);
    const totalStake = stakePerCombo * combosCount;
    
    const allOdds = selections.map(s => s.odds);
    
    const sortedOdds = [...allOdds].sort((a, b) => a - b);
    const minComboOdds = sortedOdds.slice(0, required).reduce((acc, o) => acc * o, 1);
    const minGain = stakePerCombo * minComboOdds;
    
    const generateCombos = (arr: number[], k: number): number[][] => {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [first, ...rest] = arr;
      const withFirst = generateCombos(rest, k - 1).map(c => [first, ...c]);
      const withoutFirst = generateCombos(rest, k);
      return [...withFirst, ...withoutFirst];
    };
    const allCombos = generateCombos(allOdds, required);
    const maxGain = allCombos.reduce((sum, c) => {
      const comboOdds = c.reduce((acc, o) => acc * o, 1);
      return sum + (stakePerCombo * comboOdds);
    }, 0);
    
    const minRecovery = Math.round((minGain / totalStake) * 100);
    
    return {
      selections,
      systemType,
      combinationsCount: combosCount,
      stakePerCombo,
      potentialGain: { min: parseFloat(minGain.toFixed(2)), max: parseFloat(maxGain.toFixed(2)) },
      minRecoveryPercent: minRecovery,
    };
  }, [playersWithOdds, stakePerCombo]);

  const handleOddsChange = (playerId: string, field: 'odds' | 'betType', value: string) => {
    setOddsInputs(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        odds: prev[playerId]?.odds || '',
        betType: prev[playerId]?.betType || 'Buteur',
        [field]: value,
      }
    }));
  };

  const handlePlaceBet = async (player: PlayerSuggestion) => {
    const input = oddsInputs[player.id];
    if (!input?.odds) {
      toast.error('Veuillez saisir la cote');
      return;
    }
    const odds = parseFloat(input.odds);
    if (isNaN(odds) || odds <= 1) {
      toast.error('Cote invalide');
      return;
    }

    setIsPlacing(player.id);
    const today = new Date().toISOString().split('T')[0];
    
    try {
      addBet({
        bet_date: today,
        match_name: player.match,
        bet_type: input.betType === 'Point' ? 'PLAYER_POINT' : 'PLAYER_GOAL',
        selection: `${player.name} - ${input.betType}`,
        odds,
        stake: 1,
        potential_gain: odds,
        outcome: 'pending',
        actual_gain: 0,
        source: 'player_pillar',
        notes: `[${player.category}] ${player.reasoning}`,
      });
      
      toast.success(`${player.name} placé ! @${odds.toFixed(2)}`);
    } catch (err) {
      toast.error('Erreur lors du placement');
    } finally {
      setIsPlacing(null);
    }
  };

  const handlePlaceSuperCombo = async () => {
    if (!superCombo) return;
    setIsPlacing('super');
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const selectionsStr = superCombo.selections.map(s => `${s.name} (${s.betType})`).join(' + ');
      const totalStake = superCombo.stakePerCombo * superCombo.combinationsCount;
      
      addBet({
        bet_date: today,
        match_name: superCombo.selections.map(s => s.match).filter((v, i, a) => a.indexOf(v) === i).join(' | '),
        bet_type: `SYSTEM_${superCombo.systemType.replace('/', '_')}`,
        selection: selectionsStr,
        odds: superCombo.selections.reduce((acc, s) => acc * s.odds, 1),
        stake: totalStake,
        potential_gain: superCombo.potentialGain.max,
        outcome: 'pending',
        actual_gain: 0,
        source: 'player_super_combo',
        notes: `[SUPER COMBO JOUEURS] Système ${superCombo.systemType} • ${superCombo.combinationsCount} combos @ ${superCombo.stakePerCombo.toFixed(2)}€\nJoueurs: ${superCombo.selections.map(s => `${s.name} @${s.odds}`).join(', ')}\nSi ${superCombo.systemType.split('/')[0]}/${superCombo.systemType.split('/')[1]} OK: récup ${superCombo.minRecoveryPercent}%`,
      });
      
      toast.success('Super Combo Joueurs placé ! 🎯');
    } catch (err) {
      toast.error('Erreur lors du placement');
    } finally {
      setIsPlacing(null);
    }
  };

  const formatTime = (ts: string) => 
    new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const renderPlayerCard = (player: PlayerSuggestion, colorClass: string) => {
    const input = oddsInputs[player.id] || { odds: '', betType: 'Buteur' as const };
    const hasValidOdds = input.odds && parseFloat(input.odds) > 1;

    return (
      <div 
        key={player.id}
        className={`p-3 rounded-lg border ${colorClass} bg-card/50`}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{player.name}</p>
              <Badge variant="outline" className="text-xs">{player.team}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{player.match}</p>
          </div>
          <div className="text-right">
            <div className={`font-bold ${player.confidence >= 80 ? 'text-success' : player.confidence >= 60 ? 'text-warning' : 'text-muted-foreground'}`}>
              {player.confidence}%
            </div>
            <p className="text-xs text-muted-foreground">{formatTime(player.matchTime)}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
          <span><Target className="w-3 h-3 inline mr-1" />{player.goalsLast14} buts</span>
          {player.ppGoals > 0 && <span><Zap className="w-3 h-3 inline mr-1" />{player.ppGoals} PP</span>}
        </div>
        
        <p className="text-xs text-muted-foreground mb-3">{player.reasoning}</p>

        {/* Manual Odds Input */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Cote Winamax</label>
            <Input
              type="number"
              step="0.01"
              min="1.01"
              placeholder="Ex: 3.50"
              value={input.odds}
              onChange={(e) => handleOddsChange(player.id, 'odds', e.target.value)}
              className="h-8 font-mono text-sm"
            />
          </div>
          <div className="w-24">
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <select
              value={input.betType}
              onChange={(e) => handleOddsChange(player.id, 'betType', e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="Buteur">Buteur</option>
              <option value="Point">Point</option>
            </select>
          </div>
          <Button
            size="sm"
            variant={hasValidOdds ? "default" : "outline"}
            className="h-8 px-3"
            disabled={!hasValidOdds || isPlacing === player.id || isUpdating}
            onClick={() => handlePlaceBet(player)}
          >
            <DollarSign className="w-3 h-3" />
          </Button>
        </div>
        
        {hasValidOdds && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Gain potentiel:</span>
            <span className="font-mono text-success">+{(parseFloat(input.odds) - 1).toFixed(2)}€</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              Paris JOUEURS
              <Badge className="bg-primary/20 text-primary border-primary/30 border text-xs">
                IA + Manuel
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              1-3 SAFE • 1-3 FUN • Super Combo (saisie cotes)
            </p>
          </div>
        </div>
        <Button 
          onClick={fetchPlayerSuggestions} 
          disabled={isLoading}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-4">
          {/* SAFE Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-success" />
              <span className="text-sm font-medium">SAFE</span>
              <Badge variant="outline" className="text-xs">Confiance ≥80%</Badge>
            </div>
            <div className="grid gap-2">
              {safePlayers.length > 0 ? safePlayers.map(p => renderPlayerCard(p, 'border-success/30')) : (
                <p className="text-xs text-muted-foreground text-center py-3">Aucun joueur SAFE ce soir</p>
              )}
            </div>
          </div>

          {/* FUN Section */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-warning" />
              <span className="text-sm font-medium">FUN</span>
              <Badge variant="outline" className="text-xs">Confiance 60-80%</Badge>
            </div>
            <div className="grid gap-2">
              {funPlayers.length > 0 ? funPlayers.map(p => renderPlayerCard(p, 'border-warning/30')) : (
                <p className="text-xs text-muted-foreground text-center py-3">Aucun joueur FUN ce soir</p>
              )}
            </div>
          </div>

          {/* Super Combo Section */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">SUPER COMBO JOUEURS</span>
              <Badge className="bg-accent/20 text-accent border-accent/30 text-xs">
                {playersWithOdds.length}/4+ cotes saisies
              </Badge>
            </div>
            
            {playersWithOdds.length < 4 ? (
              <div className="p-4 rounded-lg border border-dashed border-accent/30 bg-accent/5 text-center">
                <Calculator className="w-8 h-8 mx-auto mb-2 text-accent/50" />
                <p className="text-sm text-muted-foreground">
                  Saisissez les cotes de <strong>4 joueurs minimum</strong> pour créer un Super Combo
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ({playersWithOdds.length}/4 - Manque {4 - playersWithOdds.length} joueur(s))
                </p>
              </div>
            ) : superCombo && (
              <div className="p-4 rounded-lg border-2 border-accent/30 bg-accent/5">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-accent text-accent-foreground">
                    Système {superCombo.systemType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {superCombo.combinationsCount} combinaisons
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  {superCombo.selections.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {s.name} ({s.betType}) @{s.odds.toFixed(2)}
                    </Badge>
                  ))}
                </div>
                
                {/* Stake Editor */}
                <div className="flex items-center gap-3 mb-3 p-2 rounded bg-background/50">
                  <label className="text-xs text-muted-foreground">Mise/combo:</label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0.05"
                    value={stakePerCombo}
                    onChange={(e) => setStakePerCombo(parseFloat(e.target.value) || 0.25)}
                    className="h-7 w-20 font-mono text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    × {superCombo.combinationsCount} = {(stakePerCombo * superCombo.combinationsCount).toFixed(2)}€
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Gain min</p>
                    <p className="font-mono font-bold text-success">{superCombo.potentialGain.min.toFixed(2)}€</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gain max</p>
                    <p className="font-mono font-bold text-accent">{superCombo.potentialGain.max.toFixed(2)}€</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Récup.</p>
                    <p className={`font-bold ${superCombo.minRecoveryPercent >= 80 ? 'text-success' : 'text-warning'}`}>
                      {superCombo.minRecoveryPercent}%
                    </p>
                  </div>
                </div>

                <Button
                  className="w-full gap-2"
                  disabled={isPlacing === 'super' || isUpdating}
                  onClick={handlePlaceSuperCombo}
                >
                  <Trophy className="w-4 h-4" />
                  Placer Super Combo ({(stakePerCombo * superCombo.combinationsCount).toFixed(2)}€)
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// Helper functions
function extractTeamsFromMatch(matchName: string): string[] {
  const teamMappings: Record<string, string> = {
    'maple leafs': 'TOR', 'toronto': 'TOR',
    'canadiens': 'MTL', 'montreal': 'MTL',
    'bruins': 'BOS', 'boston': 'BOS',
    'rangers': 'NYR', 'new york rangers': 'NYR',
    'islanders': 'NYI', 'new york islanders': 'NYI',
    'devils': 'NJD', 'new jersey': 'NJD',
    'flyers': 'PHI', 'philadelphia': 'PHI',
    'penguins': 'PIT', 'pittsburgh': 'PIT',
    'capitals': 'WSH', 'washington': 'WSH',
    'hurricanes': 'CAR', 'carolina': 'CAR',
    'lightning': 'TBL', 'tampa bay': 'TBL',
    'panthers': 'FLA', 'florida': 'FLA',
    'red wings': 'DET', 'detroit': 'DET',
    'sabres': 'BUF', 'buffalo': 'BUF',
    'senators': 'OTT', 'ottawa': 'OTT',
    'blue jackets': 'CBJ', 'columbus': 'CBJ',
    'jets': 'WPG', 'winnipeg': 'WPG',
    'wild': 'MIN', 'minnesota': 'MIN',
    'blackhawks': 'CHI', 'chicago': 'CHI',
    'blues': 'STL', 'st. louis': 'STL', 'st louis': 'STL',
    'predators': 'NSH', 'nashville': 'NSH',
    'stars': 'DAL', 'dallas': 'DAL',
    'avalanche': 'COL', 'colorado': 'COL',
    'coyotes': 'ARI', 'arizona': 'ARI',
    'ducks': 'ANA', 'anaheim': 'ANA',
    'kings': 'LAK', 'los angeles': 'LAK',
    'sharks': 'SJS', 'san jose': 'SJS',
    'golden knights': 'VGK', 'vegas': 'VGK',
    'kraken': 'SEA', 'seattle': 'SEA',
    'canucks': 'VAN', 'vancouver': 'VAN',
    'flames': 'CGY', 'calgary': 'CGY',
    'oilers': 'EDM', 'edmonton': 'EDM',
    'utah': 'UTA', 'utah hockey': 'UTA',
  };

  const parts = matchName.split(/\s+(?:vs|@|at)\s+/i);
  const teams: string[] = [];
  
  parts.forEach(part => {
    const lower = part.toLowerCase();
    for (const [key, abbr] of Object.entries(teamMappings)) {
      if (lower.includes(key)) {
        teams.push(abbr);
        break;
      }
    }
  });
  
  return teams;
}

function getOpponentAbbr(matchName: string, teamAbbr: string): string {
  const teams = extractTeamsFromMatch(matchName);
  return teams.find(t => t !== teamAbbr) || 'UNK';
}
