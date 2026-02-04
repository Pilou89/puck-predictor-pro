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
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface TeamBet {
  id: string;
  type: 'SAFE' | 'OUTSIDER';
  selection: string;
  match: string;
  odds: number;
  commenceTime: string;
  reasoning: string;
}

interface TeamPillarData {
  safeBets: TeamBet[];
  outsiderBet: TeamBet | null;
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

  const fetchTeamOpportunities = async () => {
    setIsLoading(true);
    setError(null);

    try {
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

      // Process SAFE bets (1.40 - 1.80)
      const safeCandidates = (h2hOdds || [])
        .filter(o => o.price >= 1.40 && o.price <= 1.80)
        .map(o => {
          // Extract team abbreviation from selection
          const selectionTeam = extractTeamAbbr(o.selection);
          const meta = teamMetaMap.get(selectionTeam);
          
          // Check opponent discipline
          const opponentAbbr = getOpponentAbbr(o.match_name, selectionTeam);
          const opponentMeta = teamMetaMap.get(opponentAbbr);
          
          let score = 0;
          const reasons: string[] = [];
          
          // B2B advantage
          if (opponentMeta?.is_b2b) {
            score += 15;
            reasons.push("Adversaire en B2B 🔋");
          }
          
          // Discipline advantage (opponent has high PIM)
          if (opponentMeta?.pim_per_game && opponentMeta.pim_per_game >= 8.0) {
            score += 10;
            reasons.push(`Adv. indiscipliné (${opponentMeta.pim_per_game.toFixed(1)} PIM/G)`);
          }
          
          // Low odds = higher implied probability
          score += Math.round((1.80 - o.price) * 20);
          
          return {
            id: o.id,
            type: 'SAFE' as const,
            selection: o.selection,
            match: o.match_name,
            odds: o.price,
            commenceTime: o.commence_time,
            reasoning: reasons.length > 0 ? reasons.join(' • ') : `Favori solide @${o.price.toFixed(2)}`,
            score,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);

      // Process OUTSIDER bet (> 3.50)
      const outsiderCandidates = (h2hOdds || [])
        .filter(o => o.price >= 3.50)
        .map(o => {
          const selectionTeam = extractTeamAbbr(o.selection);
          const opponentAbbr = getOpponentAbbr(o.match_name, selectionTeam);
          const opponentMeta = teamMetaMap.get(opponentAbbr);
          
          let score = 0;
          const reasons: string[] = [];
          
          // If favorite is B2B, outsider has a chance
          if (opponentMeta?.is_b2b) {
            score += 20;
            reasons.push("Favori en B2B 🔋");
          }
          
          // Higher odds = higher potential
          score += Math.round((o.price - 3.50) * 5);
          reasons.push(`Grosse cote @${o.price.toFixed(2)}`);
          
          return {
            id: o.id,
            type: 'OUTSIDER' as const,
            selection: o.selection,
            match: o.match_name,
            odds: o.price,
            commenceTime: o.commence_time,
            reasoning: reasons.join(' • '),
            score,
          };
        })
        .sort((a, b) => b.score - a.score);

      setData({
        safeBets: safeCandidates,
        outsiderBet: outsiderCandidates[0] || null,
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
              <Badge variant="outline" className="text-xs mb-1">
                {bet.type === 'SAFE' ? 'Safe' : 'Outsider'}
              </Badge>
              <p className="font-semibold">{bet.selection}</p>
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
              Cotes H2H Winamax FR • Victoires d'équipe
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
          {/* SAFE Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-success" />
              <span className="text-sm font-medium">Safe (1.40 - 1.80)</span>
              <Badge variant="outline" className="text-xs">2 max</Badge>
            </div>
            <div className="space-y-3">
              {data.safeBets.length > 0 ? (
                data.safeBets.map(bet => renderBetCard(bet, Shield, 'bg-success/20 text-success'))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucune cote Safe disponible (1.40-1.80)
                </p>
              )}
            </div>
          </div>

          {/* OUTSIDER Section */}
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-warning" />
              <span className="text-sm font-medium">Outsider FUN (≥3.50)</span>
            </div>
            {data.outsiderBet ? (
              renderBetCard(data.outsiderBet, Zap, 'bg-warning/20 text-warning')
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun outsider intéressant ce soir
              </p>
            )}
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
  // Try to match known team names
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
  // Match format: "Team A vs Team B" or "Team A @ Team B"
  const parts = matchName.split(/\s+(?:vs|@|at)\s+/i);
  if (parts.length !== 2) return 'UNK';
  
  const team1 = extractTeamAbbr(parts[0]);
  const team2 = extractTeamAbbr(parts[1]);
  
  return team1 === teamAbbr ? team2 : team1;
}
