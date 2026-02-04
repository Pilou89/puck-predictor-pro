import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useBankroll } from "@/hooks/useBankroll";
import { TonightBetsPanel } from "./TonightBetsPanel";
import { 
  Target, 
  RefreshCw, 
  AlertCircle, 
  Shield, 
  Sparkles,
  TrendingUp,
  DollarSign,
  Coins,
  Link2,
  Check,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface BetProposal {
  id: string;
  type: string;
  selection: string;
  match: string;
  odds: number;
  confidence: number;
  stake: number;
  stakeLabel: string;
  potentialGain: number;
  netGain: number;
  reasoning: string;
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

const BET_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  H2H: { label: 'Victoire', icon: '🏆' },
  GOAL_SCORER: { label: 'Buteur', icon: '⚽' },
  DUO: { label: 'Duo', icon: '👥' },
  POINTS_SOLO: { label: 'Points', icon: '📊' },
};

export function StrategicBettingPanel() {
  const [plan, setPlan] = useState<StrategyPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placingBetId, setPlacingBetId] = useState<string | null>(null);
  const [placedBetIds, setPlacedBetIds] = useState<Set<string>>(new Set());
  
  const { stats, addBet, isUpdating } = useBankroll();

  // Get today's bets from bankroll stats
  const today = new Date().toISOString().split('T')[0];
  const tonightBets = stats.betsHistory.filter(bet => bet.bet_date === today);

  // Check which bets are already placed (on component mount and when bets change)
  useEffect(() => {
    if (plan && tonightBets.length > 0) {
      const alreadyPlaced = new Set<string>();
      for (const bet of plan.bets) {
        // Check if this bet already exists in tonight's bets
        const exists = tonightBets.some(tb => 
          tb.selection === bet.selection && 
          tb.match_name === bet.match &&
          Math.abs(tb.odds - bet.odds) < 0.01
        );
        if (exists) {
          alreadyPlaced.add(bet.id);
        }
      }
      setPlacedBetIds(alreadyPlaced);
    }
  }, [plan, tonightBets]);

  const generateStrategy = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('betting-strategy');

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error || 'Strategy generation failed');

      setPlan(data.plan);
      toast.success('Plan de mise stratégique généré !');
    } catch (err) {
      console.error('Strategy error:', err);
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      toast.error(`Erreur: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceBet = async (bet: BetProposal) => {
    if (placedBetIds.has(bet.id) || placingBetId === bet.id) return;

    setPlacingBetId(bet.id);

    try {
      // Add bet to user_bets table
      addBet({
        bet_date: today,
        match_name: bet.match,
        bet_type: bet.type,
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        potential_gain: bet.potentialGain,
        outcome: 'pending',
        actual_gain: 0,
        source: 'ai_suggestion',
        notes: bet.reasoning,
      });

      // Mark as placed locally
      setPlacedBetIds(prev => new Set([...prev, bet.id]));
      
      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Pari placé ! 🎯</span>
          <span className="text-sm opacity-80">{bet.selection}</span>
          <span className="text-xs opacity-60">Mise: {bet.stake.toFixed(2)}€ → Gain: +{bet.netGain.toFixed(2)}€</span>
        </div>
      );
    } catch (err) {
      console.error('Error placing bet:', err);
      toast.error('Erreur lors du placement du pari');
    } finally {
      setPlacingBetId(null);
    }
  };

  const getStakeColor = (label: string) => {
    if (label.includes('Loto')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (label.includes('Sécurité')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (label.includes('Super')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-success';
    if (confidence >= 65) return 'text-warning';
    return 'text-muted-foreground';
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-success/20 to-primary/20">
              <Target className="w-6 h-6 text-success" />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                Plan de Mise Stratégique
                <Shield className="w-4 h-4 text-success" />
              </h3>
              <p className="text-xs text-muted-foreground">
                Stratégie de couverture optimisée par IA
              </p>
            </div>
          </div>
          <Button 
            onClick={generateStrategy} 
            disabled={isLoading}
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Génération...' : 'Générer le Plan'}
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!plan && !isLoading && !error && (
          <div className="text-center py-8">
            <Target className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              Cliquez sur "Générer le Plan" pour obtenir la feuille de route
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              L'IA génère automatiquement le plan à 18h chaque jour
            </p>
          </div>
        )}

        {/* Strategy Plan */}
        {plan && !isLoading && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Coins className="w-4 h-4" />
                  <span className="text-xs">Mise Totale</span>
                </div>
                <p className="font-mono font-bold text-lg">{plan.totalStake.toFixed(2)}€</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs">Gain Potentiel</span>
                </div>
                <p className="font-mono font-bold text-lg text-success">
                  {plan.totalPotentialGain.toFixed(2)}€
                </p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Shield className="w-4 h-4" />
                  <span className="text-xs">Couverture</span>
                </div>
                <p className={`font-mono font-bold text-lg ${
                  plan.coverageRatio >= 100 ? 'text-success' : 'text-warning'
                }`}>
                  {plan.coverageRatio}%
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                <p className="text-sm italic">{plan.summary}</p>
              </div>
            </div>

            {/* Bets List */}
            <div className="space-y-3">
              {plan.bets.map((bet, index) => {
                const typeInfo = BET_TYPE_LABELS[bet.type] || { label: bet.type, icon: '📌' };
                const linkedBet = bet.coveredBy 
                  ? plan.bets.find(b => b.id === bet.coveredBy) 
                  : null;
                const isPlaced = placedBetIds.has(bet.id);
                const isPlacing = placingBetId === bet.id;

                return (
                  <div 
                    key={bet.id}
                    className={`p-4 rounded-lg border transition-all ${
                      isPlaced 
                        ? 'bg-primary/5 border-primary/50 ring-2 ring-primary/20' 
                        : 'bg-card border-border/50 hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{typeInfo.icon}</span>
                        <Badge variant="outline" className="text-xs">
                          {typeInfo.label}
                        </Badge>
                        <Badge className={`${getStakeColor(bet.stakeLabel)} border text-xs`}>
                          {bet.stakeLabel}
                        </Badge>
                        {isPlaced && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 border text-xs">
                            <Check className="w-3 h-3 mr-1" />
                            En cours
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${getConfidenceColor(bet.confidence)}`}>
                          {bet.confidence}%
                        </span>
                        <Progress 
                          value={bet.confidence} 
                          className="w-16 h-1.5" 
                        />
                      </div>
                    </div>

                    <div className="mb-2">
                      <p className="font-semibold">{bet.selection}</p>
                      <p className="text-sm text-muted-foreground">{bet.match}</p>
                    </div>

                    <div className="flex items-center gap-4 mb-3 text-sm">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <span className="font-mono font-bold">@{bet.odds.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Coins className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono">{bet.stake.toFixed(2)}€</span>
                      </div>
                      <div className="flex items-center gap-1 text-success">
                        <DollarSign className="w-4 h-4" />
                        <span className="font-mono font-bold">+{bet.netGain.toFixed(2)}€</span>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mb-3">{bet.reasoning}</p>

                    {bet.coveredBy && (
                      <div className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
                        <Link2 className="w-3 h-3" />
                        <span>Couvert par: {linkedBet?.selection || bet.coveredBy}</span>
                      </div>
                    )}

                    {/* Place Bet Button */}
                    <Button
                      onClick={() => handlePlaceBet(bet)}
                      disabled={isPlaced || isPlacing || isUpdating}
                      size="sm"
                      variant={isPlaced ? "outline" : "default"}
                      className={`w-full ${
                        isPlaced 
                          ? 'bg-primary/10 border-primary/30 text-primary cursor-default' 
                          : 'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70'
                      }`}
                    >
                      {isPlacing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Placement en cours...
                        </>
                      ) : isPlaced ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Pari placé
                        </>
                      ) : (
                        <>
                          <Target className="w-4 h-4 mr-2" />
                          Placer ce pari
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Timestamp */}
            <p className="text-xs text-muted-foreground text-center">
              Plan généré à {formatTime(plan.timestamp)}
            </p>
          </div>
        )}
      </Card>

      {/* Tonight's Bets Panel */}
      <TonightBetsPanel bets={tonightBets} />
    </div>
  );
}
