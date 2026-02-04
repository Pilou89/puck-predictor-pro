import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { 
  Trophy, 
  Shield, 
  Zap, 
  RefreshCw, 
  AlertCircle,
  TrendingUp,
  Sparkles,
  Check,
  DollarSign,
  Calculator
} from "lucide-react";
import { toast } from "sonner";
import { useBankroll } from "@/hooks/useBankroll";

interface TeamBet {
  id: string;
  selection: string;
  match: string;
  odds: number;
  commenceTime: string;
  reasoning: string;
  confidence: number;
  learningBoost?: number;
}

interface SuperComboTeam {
  selections: TeamBet[];
  totalOdds: number;
  systemType: string;
  combinationsCount: number;
  stakePerCombo: number;
  potentialGain: { min: number; max: number };
  minRecoveryPercent: number;
}

// Helper: calculate combinations C(n, k)
function combinations(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

export function TeamBetsPanel() {
  const { addBet, isUpdating } = useBankroll();
  
  const [safeBets, setSafeBets] = useState<TeamBet[]>([]);
  const [funBets, setFunBets] = useState<TeamBet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [learningBoosts, setLearningBoosts] = useState<Map<string, number>>(new Map());
  const [stakePerCombo, setStakePerCombo] = useState(0.50);
  const [isPlacing, setIsPlacing] = useState<string | null>(null);

  const fetchLearningMetrics = async () => {
    try {
      const { data: metrics } = await supabase
        .from('learning_metrics')
        .select('*')
        .eq('metric_type', 'team');
      
      const boosts = new Map<string, number>();
      metrics?.forEach(m => {
        boosts.set(m.metric_key, m.confidence_adjustment || 0);
      });
      setLearningBoosts(boosts);
    } catch (err) {
      console.log('No learning metrics yet');
    }
  };

  const fetchTeamBets = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await fetchLearningMetrics();

      // Fetch H2H odds from Winamax FR
      const { data: h2hOdds, error: oddsError } = await supabase
        .from('winamax_odds')
        .select('*')
        .eq('market_type', 'h2h')
        .gte('commence_time', new Date().toISOString())
        .order('commence_time', { ascending: true });

      if (oddsError) throw oddsError;

      // Fetch team metadata
      const { data: teamMeta, error: metaError } = await supabase
        .from('team_meta')
        .select('*');

      if (metaError) throw metaError;

      const teamMetaMap = new Map(teamMeta?.map(t => [t.team_abbr, t]) || []);

      // Process bets
      const processedBets = (h2hOdds || []).map(o => {
        const selectionTeam = extractTeamAbbr(o.selection);
        const opponentAbbr = getOpponentAbbr(o.match_name, selectionTeam);
        const opponentMeta = teamMetaMap.get(opponentAbbr);
        const teamBoost = learningBoosts.get(selectionTeam) || 0;
        
        let score = 50 + teamBoost;
        const reasons: string[] = [];
        
        if (opponentMeta?.is_b2b) {
          score += 15;
          reasons.push("Adv. B2B 🔋");
        }
        
        if (opponentMeta?.pim_per_game && opponentMeta.pim_per_game >= 8.0) {
          score += 10;
          reasons.push(`PIM ${opponentMeta.pim_per_game.toFixed(1)}/G`);
        }
        
        if (o.price <= 1.80) {
          score += Math.round((1.80 - o.price) * 20);
        }
        
        if (teamBoost > 0) {
          reasons.push(`📈 +${teamBoost}%`);
        } else if (teamBoost < 0) {
          reasons.push(`📉 ${teamBoost}%`);
        }
        
        return {
          id: o.id,
          selection: o.selection,
          match: o.match_name,
          odds: o.price,
          commenceTime: o.commence_time,
          reasoning: reasons.length > 0 ? reasons.join(' • ') : `Cote @${o.price.toFixed(2)}`,
          confidence: Math.min(95, Math.max(30, score)),
          learningBoost: teamBoost,
        };
      });

      // Categorize: SAFE (1.40-1.80), FUN (1.80-3.50)
      const safe = processedBets
        .filter(o => o.odds >= 1.40 && o.odds <= 1.80)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);

      const fun = processedBets
        .filter(o => o.odds > 1.80 && o.odds <= 3.50)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);

      setSafeBets(safe);
      setFunBets(fun);
      toast.success('Paris équipes mis à jour');
    } catch (err) {
      console.error('Team bets error:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamBets();
  }, []);

  // Super Combo: 2 SAFE + 2 FUN = système 3/4 ou 4/4
  const superCombo = useMemo<SuperComboTeam | null>(() => {
    const safeToUse = safeBets.slice(0, 2);
    const funToUse = funBets.slice(0, 2);
    const selections = [...safeToUse, ...funToUse];
    
    if (selections.length < 4) return null;
    
    const systemType = "3/4"; // 3 sur 4 gagnants pour récupérer
    const required = 3;
    const total = 4;
    const combosCount = combinations(total, required);
    const totalStake = stakePerCombo * combosCount;
    
    const allOdds = selections.map(s => s.odds);
    
    // Min gain: 3 plus petites cotes
    const sortedOdds = [...allOdds].sort((a, b) => a - b);
    const minComboOdds = sortedOdds.slice(0, required).reduce((acc, o) => acc * o, 1);
    const minGain = stakePerCombo * minComboOdds;
    
    // Max gain: toutes les combinaisons
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
      totalOdds: allOdds.reduce((acc, o) => acc * o, 1),
      systemType,
      combinationsCount: combosCount,
      stakePerCombo,
      potentialGain: { min: parseFloat(minGain.toFixed(2)), max: parseFloat(maxGain.toFixed(2)) },
      minRecoveryPercent: minRecovery,
    };
  }, [safeBets, funBets, stakePerCombo]);

  const handlePlaceBet = async (bet: TeamBet, type: 'SAFE' | 'FUN') => {
    setIsPlacing(bet.id);
    const today = new Date().toISOString().split('T')[0];
    
    try {
      addBet({
        bet_date: today,
        match_name: bet.match,
        bet_type: 'H2H',
        selection: bet.selection,
        odds: bet.odds,
        stake: 1,
        potential_gain: bet.odds,
        outcome: 'pending',
        actual_gain: 0,
        source: 'team_pillar',
        notes: `[${type}] ${bet.reasoning}`,
      });
      
      toast.success(`${bet.selection} placé ! @${bet.odds.toFixed(2)}`);
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
      const selectionsStr = superCombo.selections.map(s => s.selection).join(' + ');
      const totalStake = superCombo.stakePerCombo * superCombo.combinationsCount;
      
      addBet({
        bet_date: today,
        match_name: superCombo.selections.map(s => s.match).join(' | '),
        bet_type: `SYSTEM_${superCombo.systemType.replace('/', '_')}`,
        selection: selectionsStr,
        odds: superCombo.totalOdds,
        stake: totalStake,
        potential_gain: superCombo.potentialGain.max,
        outcome: 'pending',
        actual_gain: 0,
        source: 'team_super_combo',
        notes: `[SUPER COMBO ÉQUIPE] Système ${superCombo.systemType} • ${superCombo.combinationsCount} combos @ ${superCombo.stakePerCombo.toFixed(2)}€\nSi 3/4 OK: récup ${superCombo.minRecoveryPercent}%`,
      });
      
      toast.success('Super Combo Équipe placé ! 🏆');
    } catch (err) {
      toast.error('Erreur lors du placement');
    } finally {
      setIsPlacing(null);
    }
  };

  const formatTime = (ts: string) => 
    new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const renderBetCard = (bet: TeamBet, type: 'SAFE' | 'FUN', colorClass: string) => (
    <div 
      key={bet.id}
      className={`p-3 rounded-lg border ${colorClass} bg-card/50`}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-semibold text-sm">{bet.selection}</p>
          <p className="text-xs text-muted-foreground">{bet.match}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-success font-mono font-bold">
            @{bet.odds.toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground">{formatTime(bet.commenceTime)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{bet.reasoning}</p>
      <Button
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs"
        disabled={isPlacing === bet.id || isUpdating}
        onClick={() => handlePlaceBet(bet, type)}
      >
        <DollarSign className="w-3 h-3 mr-1" />
        Placer 1€
      </Button>
    </div>
  );

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-success/20 to-primary/20">
            <Trophy className="w-6 h-6 text-success" />
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              Paris ÉQUIPE
              <Badge className="bg-success/20 text-success border-success/30 border text-xs">
                Auto
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              1-3 SAFE • 1-3 FUN • Super Combo
            </p>
          </div>
        </div>
        <Button 
          onClick={fetchTeamBets} 
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
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
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
              <Badge variant="outline" className="text-xs">1.40 - 1.80</Badge>
            </div>
            <div className="grid gap-2">
              {safeBets.length > 0 ? safeBets.map(b => renderBetCard(b, 'SAFE', 'border-success/30')) : (
                <p className="text-xs text-muted-foreground text-center py-3">Aucun pari SAFE disponible</p>
              )}
            </div>
          </div>

          {/* FUN Section */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-warning" />
              <span className="text-sm font-medium">FUN</span>
              <Badge variant="outline" className="text-xs">1.80 - 3.50</Badge>
            </div>
            <div className="grid gap-2">
              {funBets.length > 0 ? funBets.map(b => renderBetCard(b, 'FUN', 'border-warning/30')) : (
                <p className="text-xs text-muted-foreground text-center py-3">Aucun pari FUN disponible</p>
              )}
            </div>
          </div>

          {/* Super Combo Section */}
          {superCombo && (
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">SUPER COMBO ÉQUIPE</span>
                <Badge className="bg-accent/20 text-accent border-accent/30 text-xs">
                  Système {superCombo.systemType}
                </Badge>
              </div>
              
              <div className="p-4 rounded-lg border-2 border-accent/30 bg-accent/5">
                <div className="flex flex-wrap gap-2 mb-3">
                  {superCombo.selections.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {s.selection} @{s.odds.toFixed(2)}
                    </Badge>
                  ))}
                </div>
                
                {/* Stake Editor */}
                <div className="flex items-center gap-3 mb-3 p-2 rounded bg-background/50">
                  <label className="text-xs text-muted-foreground">Mise/combo:</label>
                  <Input
                    type="number"
                    step="0.10"
                    min="0.10"
                    value={stakePerCombo}
                    onChange={(e) => setStakePerCombo(parseFloat(e.target.value) || 0.50)}
                    className="h-7 w-20 font-mono text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    × {superCombo.combinationsCount} = {(stakePerCombo * superCombo.combinationsCount).toFixed(2)}€
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Gain min (3/4)</p>
                    <p className="font-mono font-bold text-success">{superCombo.potentialGain.min.toFixed(2)}€</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gain max (4/4)</p>
                    <p className="font-mono font-bold text-accent">{superCombo.potentialGain.max.toFixed(2)}€</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Récup. mise</p>
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
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Helper functions
function extractTeamAbbr(selection: string): string {
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

  const lower = selection.toLowerCase();
  for (const [key, abbr] of Object.entries(teamMappings)) {
    if (lower.includes(key)) return abbr;
  }
  return 'UNK';
}

function getOpponentAbbr(matchName: string, teamAbbr: string): string {
  const parts = matchName.split(/\s+(?:vs|@|at)\s+/i);
  if (parts.length !== 2) return 'UNK';
  
  const team1 = extractTeamAbbr(parts[0]);
  const team2 = extractTeamAbbr(parts[1]);
  
  return team1 === teamAbbr ? team2 : team1;
}
