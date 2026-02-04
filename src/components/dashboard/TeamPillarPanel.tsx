import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  Trophy, 
  Shield, 
  Zap, 
  RefreshCw, 
  AlertCircle,
  TrendingUp,
  Check,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";

export interface TeamBet {
  id: string;
  type: 'SAFE' | 'FUN' | 'SUPER_COMBO';
  selection: string;
  match: string;
  odds: number;
  commenceTime: string;
  reasoning: string;
  confidence?: number;
  learningBoost?: number;
}

interface TeamPillarData {
  safeBets: TeamBet[];
  funBets: TeamBet[];
  superComboBets: TeamBet[];
  timestamp: string;
}

interface TeamPillarPanelProps {
  onBetSelect?: (bet: TeamBet) => void;
  selectedBets?: Set<string>;
}

export function TeamPillarPanel({ onBetSelect, selectedBets = new Set() }: TeamPillarPanelProps) {
  const [data, setData] = useState<TeamPillarData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [learningBoosts, setLearningBoosts] = useState<Map<string, number>>(new Map());

  const fetchLearningMetrics = async () => {
    try {
      const { data: metrics } = await supabase
        .from('learning_metrics')
        .select('*')
        .eq('metric_type', 'team');
      
      const boosts = new Map<string, number>();
      metrics?.forEach(m => {
        boosts.set(m.metric_key, m.confidence_adjustment);
      });
      setLearningBoosts(boosts);
    } catch (err) {
      console.log('No learning metrics yet');
    }
  };

  const fetchTeamOpportunities = async () => {
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

      // Fetch team metadata for analysis
      const { data: teamMeta, error: metaError } = await supabase
        .from('team_meta')
        .select('*');

      if (metaError) throw metaError;

      const teamMetaMap = new Map(teamMeta?.map(t => [t.team_abbr, t]) || []);

      // Process all bets with learning adjustments
      const processedBets = (h2hOdds || []).map(o => {
        const selectionTeam = extractTeamAbbr(o.selection);
        const opponentAbbr = getOpponentAbbr(o.match_name, selectionTeam);
        const opponentMeta = teamMetaMap.get(opponentAbbr);
        const teamBoost = learningBoosts.get(selectionTeam) || 0;
        
        let score = 50 + teamBoost;
        const reasons: string[] = [];
        
        // B2B advantage
        if (opponentMeta?.is_b2b) {
          score += 15;
          reasons.push("Adversaire en B2B 🔋");
        }
        
        // Discipline advantage
        if (opponentMeta?.pim_per_game && opponentMeta.pim_per_game >= 8.0) {
          score += 10;
          reasons.push(`Adv. indiscipliné (${opponentMeta.pim_per_game.toFixed(1)} PIM/G)`);
        }
        
        // Odds-based scoring
        if (o.price <= 1.80) {
          score += Math.round((1.80 - o.price) * 20);
        }
        
        // Learning boost indicator
        if (teamBoost > 0) {
          reasons.push(`📈 +${teamBoost}% IA learning`);
        } else if (teamBoost < 0) {
          reasons.push(`📉 ${teamBoost}% IA learning`);
        }
        
        return {
          id: o.id,
          selection: o.selection,
          match: o.match_name,
          odds: o.price,
          commenceTime: o.commence_time,
          reasoning: reasons.length > 0 ? reasons.join(' • ') : `Cote @${o.price.toFixed(2)}`,
          score,
          confidence: Math.min(95, Math.max(30, score)),
          learningBoost: teamBoost,
        };
      });

      // Categorize by odds
      const safeBets: TeamBet[] = processedBets
        .filter(o => o.odds >= 1.40 && o.odds <= 1.80)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(b => ({ ...b, type: 'SAFE' as const }));

      const funBets: TeamBet[] = processedBets
        .filter(o => o.odds > 1.80 && o.odds < 4.50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(b => ({ ...b, type: 'FUN' as const }));

      const superComboBets: TeamBet[] = processedBets
        .filter(o => o.odds >= 4.50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(b => ({ ...b, type: 'SUPER_COMBO' as const }));

      setData({
        safeBets,
        funBets,
        superComboBets,
        timestamp: new Date().toISOString(),
      });

      toast.success('Opportunités équipes mises à jour');
    } catch (err) {
      console.error('Team pillar error:', err);
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamOpportunities();
  }, []);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const renderBetCard = (bet: TeamBet, icon: React.ElementType, colorClass: string) => {
    const Icon = icon;
    const isSelected = selectedBets.has(bet.id);

    return (
      <div 
        key={bet.id}
        className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
          isSelected 
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
            : 'border-border/50 hover:border-primary/30 bg-card/50'
        }`}
        onClick={() => onBetSelect?.(bet)}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${colorClass}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">
                  {bet.type === 'SAFE' ? 'Safe' : bet.type === 'FUN' ? 'Fun' : 'Super Combo'}
                </Badge>
                {bet.learningBoost !== 0 && bet.learningBoost !== undefined && (
                  <Badge className={`text-xs ${bet.learningBoost > 0 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                    {bet.learningBoost > 0 ? '+' : ''}{bet.learningBoost}%
                  </Badge>
                )}
              </div>
              <p className="font-semibold mt-1">{bet.selection}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-success">
              <TrendingUp className="w-4 h-4" />
              <span className="font-mono font-bold">@{bet.odds.toFixed(2)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{formatTime(bet.commenceTime)}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-2">{bet.match}</p>
        <p className="text-xs italic text-muted-foreground">{bet.reasoning}</p>
        
        {isSelected && (
          <div className="flex items-center gap-1 mt-2 text-primary text-xs">
            <Check className="w-3 h-3" />
            <span>Sélectionné pour le panier</span>
          </div>
        )}
      </div>
    );
  };

  const renderSection = (
    title: string, 
    emoji: string,
    bets: TeamBet[], 
    icon: React.ElementType, 
    colorClass: string,
    oddsRange: string
  ) => (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{emoji}</span>
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="outline" className="text-xs">{oddsRange}</Badge>
      </div>
      <div className="space-y-3">
        {bets.length > 0 ? (
          bets.map(bet => renderBetCard(bet, icon, colorClass))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune cote {title} disponible
          </p>
        )}
      </div>
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
              Pilier ÉQUIPE
              <Badge className="bg-success/20 text-success border-success/30 border text-xs">
                100% Auto
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Cotes H2H Winamax FR • SAFE / FUN / SUPER COMBO
            </p>
          </div>
        </div>
        <Button 
          onClick={fetchTeamOpportunities} 
          disabled={isLoading}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {data && !isLoading && (
        <div className="space-y-4">
          {renderSection('SAFE', '🛡️', data.safeBets, Shield, 'bg-success/20 text-success', '1.40 - 1.80')}
          
          <div className="border-t border-border/50 pt-4">
            {renderSection('FUN', '🎲', data.funBets, Zap, 'bg-warning/20 text-warning', '1.80 - 4.50')}
          </div>
          
          <div className="border-t border-border/50 pt-4">
            {renderSection('SUPER COMBO', '🎰', data.superComboBets, Sparkles, 'bg-primary/20 text-primary', '≥ 4.50')}
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Mis à jour à {formatTime(data.timestamp)}
          </p>
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
