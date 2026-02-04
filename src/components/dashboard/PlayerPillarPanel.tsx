import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { 
  Brain, 
  User, 
  Sparkles, 
  RefreshCw, 
  AlertCircle,
  TrendingUp,
  Check,
  Zap,
  Target,
  Shield
} from "lucide-react";
import { toast } from "sonner";

export interface PlayerAnalysis {
  id: string;
  name: string;
  team: string;
  match: string;
  matchTime: string;
  goalsLast5: number;
  ppGoals: number;
  duoPartner?: string;
  confidence: number;
  reasoning: string;
  betType: 'GOAL_SCORER' | 'POINTS' | 'DUO';
  category: 'SAFE' | 'FUN' | 'SUPER_COMBO';
  learningBoost?: number;
}

export interface PlayerBet {
  id: string;
  player: PlayerAnalysis;
  manualOdds: number | null;
  stake: number;
  potentialGain: number;
  category: 'SAFE' | 'FUN' | 'SUPER_COMBO';
}

interface PlayerPillarPanelProps {
  onBetSelect?: (bet: PlayerBet) => void;
  selectedBets?: Map<string, PlayerBet>;
  defaultStake?: number;
}

export function PlayerPillarPanel({ 
  onBetSelect, 
  selectedBets = new Map(),
  defaultStake = 1
}: PlayerPillarPanelProps) {
  const [players, setPlayers] = useState<PlayerAnalysis[]>([]);
  const [oddsInputs, setOddsInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [learningBoosts, setLearningBoosts] = useState<Map<string, number>>(new Map());

  const fetchLearningMetrics = async () => {
    try {
      const { data: metrics } = await supabase
        .from('learning_metrics')
        .select('*')
        .eq('metric_type', 'player');
      
      const boosts = new Map<string, number>();
      metrics?.forEach(m => {
        boosts.set(m.metric_key.toLowerCase(), m.confidence_adjustment);
      });
      setLearningBoosts(boosts);
    } catch (err) {
      console.log('No player learning metrics yet');
    }
  };

  const fetchPlayerAnalysis = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await fetchLearningMetrics();

      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 14);

      const { data: recentGoals, error: goalsError } = await supabase
        .from('player_stats')
        .select('*')
        .gte('game_date', fiveDaysAgo.toISOString().split('T')[0])
        .order('game_date', { ascending: false });

      if (goalsError) throw goalsError;

      const { data: teamMeta, error: metaError } = await supabase
        .from('team_meta')
        .select('*');

      if (metaError) throw metaError;

      const { data: tonightOdds, error: oddsError } = await supabase
        .from('winamax_odds')
        .select('*')
        .eq('market_type', 'h2h')
        .gte('commence_time', new Date().toISOString())
        .order('commence_time', { ascending: true })
        .limit(20);

      if (oddsError) throw oddsError;

      const tonightTeams = new Set<string>();
      const tonightMatches: Record<string, { match: string; time: string }> = {};
      
      (tonightOdds || []).forEach(o => {
        const teams = extractTeamsFromMatch(o.match_name);
        teams.forEach(t => {
          tonightTeams.add(t);
          tonightMatches[t] = { match: o.match_name, time: o.commence_time };
        });
      });

      const teamMetaMap = new Map(teamMeta?.map(t => [t.team_abbr, t]) || []);

      const playerStatsMap = new Map<string, {
        goals: number;
        ppGoals: number;
        team: string;
        duo?: string;
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
        if (g.duo) existing.duo = g.duo;
        existing.games.add(g.game_date);
        
        playerStatsMap.set(key, existing);
      });

      const analyzedPlayers: PlayerAnalysis[] = [];
      
      playerStatsMap.forEach((stats, playerName) => {
        if (!tonightTeams.has(stats.team)) return;
        
        const matchInfo = tonightMatches[stats.team];
        if (!matchInfo) return;

        const opponentAbbr = getOpponentAbbr(matchInfo.match, stats.team);
        const opponentMeta = teamMetaMap.get(opponentAbbr);
        const playerBoost = learningBoosts.get(playerName.toLowerCase()) || 0;

        let confidence = 50 + playerBoost;
        const reasons: string[] = [];

        // Goals scoring
        if (stats.goals >= 4) {
          confidence += 25;
          reasons.push(`🔥 ${stats.goals} buts récents`);
        } else if (stats.goals >= 2) {
          confidence += 15;
          reasons.push(`${stats.goals} buts récents`);
        }

        // PP opportunity
        if (stats.ppGoals >= 2 && opponentMeta?.pim_per_game && opponentMeta.pim_per_game >= 8) {
          confidence += 20;
          reasons.push(`PP: ${stats.ppGoals} buts, adv. ${opponentMeta.pim_per_game.toFixed(1)} PIM/G`);
        } else if (stats.ppGoals >= 1) {
          confidence += 10;
          reasons.push(`${stats.ppGoals} but(s) en PP`);
        }

        // B2B advantage
        if (opponentMeta?.is_b2b) {
          confidence += 15;
          reasons.push("Adversaire en B2B 🔋");
        }

        // Learning boost
        if (playerBoost > 0) {
          reasons.push(`📈 +${playerBoost}% IA`);
        } else if (playerBoost < 0) {
          reasons.push(`📉 ${playerBoost}% IA`);
        }

        // Duo synergy
        let betType: 'GOAL_SCORER' | 'POINTS' | 'DUO' = 'GOAL_SCORER';
        if (stats.duo) {
          confidence += 10;
          reasons.push(`Duo avec ${stats.duo.split('+')[1]}`);
          betType = 'DUO';
        }

        confidence = Math.min(confidence, 95);

        // Categorize by confidence
        let category: 'SAFE' | 'FUN' | 'SUPER_COMBO' = 'FUN';
        if (confidence >= 85) {
          category = 'SAFE';
        } else if (confidence >= 70) {
          category = 'FUN';
        } else {
          category = 'SUPER_COMBO';
        }

        analyzedPlayers.push({
          id: `player-${playerName.replace(/\s+/g, '-').toLowerCase()}`,
          name: playerName,
          team: stats.team,
          match: matchInfo.match,
          matchTime: matchInfo.time,
          goalsLast5: stats.goals,
          ppGoals: stats.ppGoals,
          duoPartner: stats.duo?.split('+')[1],
          confidence,
          reasoning: reasons.join(' • ') || 'Joueur actif',
          betType,
          category,
          learningBoost: playerBoost,
        });
      });

      analyzedPlayers.sort((a, b) => b.confidence - a.confidence);
      setPlayers(analyzedPlayers.slice(0, 9)); // Top 9 (3 per category)

      toast.success('Analyse joueurs terminée');
    } catch (err) {
      console.error('Player analysis error:', err);
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const runAIAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analysis');
      
      if (error) throw error;
      if (data.success && data.analysis?.picks) {
        toast.success('Analyse IA enrichie !');
      }
    } catch (err) {
      console.error('AI analysis error:', err);
      toast.error('Erreur lors de l\'analyse IA');
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchPlayerAnalysis();
  }, []);

  const handleOddsChange = (playerId: string, value: string) => {
    setOddsInputs(prev => ({ ...prev, [playerId]: value }));
    
    const odds = parseFloat(value);
    const player = players.find(p => p.id === playerId);
    
    if (!isNaN(odds) && odds > 1 && player && onBetSelect) {
      // Determine category based on odds
      let category: 'SAFE' | 'FUN' | 'SUPER_COMBO' = 'FUN';
      if (odds < 2.50 && player.confidence >= 85) {
        category = 'SAFE';
      } else if (odds >= 4.00) {
        category = 'SUPER_COMBO';
      }

      onBetSelect({
        id: playerId,
        player,
        manualOdds: odds,
        stake: defaultStake,
        potentialGain: defaultStake * odds,
        category,
      });
    } else if (player && onBetSelect) {
      // Clear selection if invalid odds
      onBetSelect({
        id: playerId,
        player,
        manualOdds: null,
        stake: 0,
        potentialGain: 0,
        category: player.category,
      });
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'text-success';
    if (confidence >= 70) return 'text-warning';
    return 'text-muted-foreground';
  };

  const safePlayers = players.filter(p => p.category === 'SAFE').slice(0, 3);
  const funPlayers = players.filter(p => p.category === 'FUN').slice(0, 3);
  const superComboPlayers = players.filter(p => p.category === 'SUPER_COMBO').slice(0, 3);

  const renderPlayerCard = (player: PlayerAnalysis, showCategory: boolean = false) => {
    const bet = selectedBets.get(player.id);
    const inputOdds = oddsInputs[player.id] || '';
    const parsedOdds = parseFloat(inputOdds);
    const hasValidOdds = !isNaN(parsedOdds) && parsedOdds > 1;

    return (
      <div 
        key={player.id}
        className={`p-4 rounded-lg border-2 transition-all ${
          bet && bet.manualOdds
            ? 'border-primary bg-primary/5' 
            : 'border-border/50 bg-card/50'
        }`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{player.name}</span>
                <Badge variant="outline" className="text-xs">{player.team}</Badge>
                {player.duoPartner && (
                  <Badge className="bg-accent/20 text-accent border-accent/30 border text-xs">
                    Duo
                  </Badge>
                )}
                {player.learningBoost !== 0 && player.learningBoost !== undefined && (
                  <Badge className={`text-xs ${player.learningBoost > 0 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                    {player.learningBoost > 0 ? '+' : ''}{player.learningBoost}%
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{player.match}</p>
            </div>
          </div>
          <div className="text-right">
            <div className={`flex items-center gap-1 ${getConfidenceColor(player.confidence)}`}>
              <span className="font-mono font-bold">{player.confidence}%</span>
            </div>
            <Progress value={player.confidence} className="w-16 h-1.5 mt-1" />
          </div>
        </div>

        <div className="flex items-center gap-4 mb-3 text-sm">
          <div className="flex items-center gap-1">
            <Target className="w-4 h-4 text-primary" />
            <span>{player.goalsLast5} buts</span>
          </div>
          {player.ppGoals > 0 && (
            <div className="flex items-center gap-1">
              <Zap className="w-4 h-4 text-warning" />
              <span>{player.ppGoals} PP</span>
            </div>
          )}
          <span className="text-muted-foreground">{formatTime(player.matchTime)}</span>
        </div>

        <p className="text-sm text-muted-foreground italic mb-4">{player.reasoning}</p>

        {/* Manual Odds Input */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              Cote Winamax (buteur/point)
            </label>
            <Input
              type="number"
              step="0.01"
              min="1.01"
              placeholder="Ex: 3.50"
              value={inputOdds}
              onChange={(e) => handleOddsChange(player.id, e.target.value)}
              className="h-9 font-mono"
            />
          </div>
          {hasValidOdds && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Gain potentiel</p>
              <p className="font-mono font-bold text-success">
                +{((parsedOdds - 1) * defaultStake).toFixed(2)}€
              </p>
            </div>
          )}
        </div>

        {bet && bet.manualOdds && (
          <div className="flex items-center gap-1 mt-3 text-primary text-xs">
            <Check className="w-3 h-3" />
            <span>Ajouté au panier @{bet.manualOdds.toFixed(2)} ({bet.category})</span>
          </div>
        )}
      </div>
    );
  };

  const renderSection = (
    title: string,
    emoji: string,
    playersList: PlayerAnalysis[],
    icon: React.ElementType,
    colorClass: string,
    description: string
  ) => (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{emoji}</span>
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="outline" className="text-xs">{description}</Badge>
      </div>
      <div className="space-y-3">
        {playersList.length > 0 ? (
          playersList.map(player => renderPlayerCard(player))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun joueur {title} ce soir
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              Pilier JOUEURS
              <Badge className="bg-primary/20 text-primary border-primary/30 border text-xs">
                IA + Manuel
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              SAFE / FUN / SUPER COMBO • Saisie cote Winamax
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={runAIAnalysis} 
            disabled={isAnalyzing}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />
            {isAnalyzing ? 'IA...' : 'Enrichir IA'}
          </Button>
          <Button 
            onClick={fetchPlayerAnalysis} 
            disabled={isLoading}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!isLoading && players.length === 0 && !error && (
        <div className="text-center py-8">
          <User className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Aucun joueur analysé ce soir</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Pas de matchs ou données insuffisantes
          </p>
        </div>
      )}

      {players.length > 0 && !isLoading && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
              <div>
                <p className="font-medium text-warning">Saisie manuelle requise</p>
                <p className="text-xs text-muted-foreground">
                  L'API ne fournit pas les cotes joueurs. Entrez la cote Winamax manuellement.
                </p>
              </div>
            </div>
          </div>

          {renderSection('SAFE', '🛡️', safePlayers, Shield, 'bg-success/20 text-success', 'Confiance ≥85%')}
          
          <div className="border-t border-border/50 pt-4">
            {renderSection('FUN', '🎲', funPlayers, Zap, 'bg-warning/20 text-warning', 'Confiance 70-84%')}
          </div>
          
          <div className="border-t border-border/50 pt-4">
            {renderSection('SUPER COMBO', '🎰', superComboPlayers, Sparkles, 'bg-primary/20 text-primary', 'Cote ≥4.00')}
          </div>
        </div>
      )}
    </Card>
  );
}

// Helper functions
function extractTeamsFromMatch(matchName: string): string[] {
  const parts = matchName.split(/\s+(?:vs|@|at)\s+/i);
  return parts.map(extractTeamAbbr);
}

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
