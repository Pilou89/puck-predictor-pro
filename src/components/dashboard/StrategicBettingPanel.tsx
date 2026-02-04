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
  Check,
  Loader2,
  Users,
  Zap,
  ShoppingBasket,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { toast } from "sonner";

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

const BASKET_CONFIG = {
  SAFE: { 
    emoji: '🛡️', 
    label: 'SAFE', 
    color: 'bg-success/20 text-success border-success/30',
    bgGradient: 'from-success/10 to-success/5',
    icon: Shield,
    description: 'Haute confiance (>85%)',
  },
  DUO: { 
    emoji: '👥', 
    label: 'DUO', 
    color: 'bg-primary/20 text-primary border-primary/30',
    bgGradient: 'from-primary/10 to-primary/5',
    icon: Users,
    description: 'Basé sur les duos (3.00-5.00)',
  },
  FUN: { 
    emoji: '🎰', 
    label: 'FUN', 
    color: 'bg-warning/20 text-warning border-warning/30',
    bgGradient: 'from-warning/10 to-warning/5',
    icon: Zap,
    description: 'Grosse cote (≥4.00)',
  },
};

const BET_TYPE_LABELS: Record<string, string> = {
  H2H: 'Victoire',
  GOAL_SCORER: 'Buteur',
  DUO: 'Duo',
  POINTS_SOLO: 'Points',
};

export function StrategicBettingPanel() {
  const [basket, setBasket] = useState<EveningBasket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placingBetId, setPlacingBetId] = useState<string | null>(null);
  const [placedBetIds, setPlacedBetIds] = useState<Set<string>>(new Set());
  
  const { stats, addBet, isUpdating } = useBankroll();

  const today = new Date().toISOString().split('T')[0];
  const tonightBets = stats.betsHistory.filter(bet => bet.bet_date === today);

  // Check which bets are already placed
  useEffect(() => {
    if (basket && tonightBets.length > 0) {
      const alreadyPlaced = new Set<string>();
      const bets = [basket.safe, basket.duo, basket.fun].filter(Boolean) as BasketBet[];
      for (const bet of bets) {
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
  }, [basket, tonightBets]);

  const generateBasket = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('betting-strategy');

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error || 'Basket generation failed');

      setBasket(data.basket);
      toast.success('Panier du soir généré ! 🛒');
    } catch (err) {
      console.error('Basket error:', err);
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      toast.error(`Erreur: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceBet = async (bet: BasketBet) => {
    if (placedBetIds.has(bet.id) || placingBetId === bet.id) return;

    setPlacingBetId(bet.id);

    try {
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
        notes: `[${bet.basketType}] ${bet.reasoning}`,
      });

      setPlacedBetIds(prev => new Set([...prev, bet.id]));
      
      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Pari {bet.basketType} placé ! 🎯</span>
          <span className="text-sm opacity-80">{bet.selection}</span>
        </div>
      );
    } catch (err) {
      console.error('Error placing bet:', err);
      toast.error('Erreur lors du placement du pari');
    } finally {
      setPlacingBetId(null);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const renderBasketBlock = (bet: BasketBet | null, type: 'SAFE' | 'DUO' | 'FUN') => {
    const config = BASKET_CONFIG[type];
    const Icon = config.icon;
    const isPlaced = bet ? placedBetIds.has(bet.id) : false;
    const isPlacing = bet ? placingBetId === bet.id : false;

    return (
      <div 
        className={`relative p-4 rounded-xl border-2 transition-all ${
          isPlaced 
            ? 'border-primary/50 ring-2 ring-primary/20' 
            : 'border-border/50 hover:border-primary/30'
        } bg-gradient-to-br ${config.bgGradient}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{config.emoji}</span>
            <div>
              <Badge className={`${config.color} border font-bold`}>
                {config.label}
              </Badge>
              <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
            </div>
          </div>
          {bet && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Mise fixe</p>
              <p className="font-mono font-bold">{bet.stake.toFixed(2)}€</p>
            </div>
          )}
        </div>

        {/* Content */}
        {bet ? (
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {BET_TYPE_LABELS[bet.type] || bet.type}
                </Badge>
                {isPlaced && (
                  <Badge className="bg-primary/20 text-primary border-primary/30 border text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    En cours
                  </Badge>
                )}
              </div>
              <p className="font-semibold text-lg">{bet.selection}</p>
              <p className="text-sm text-muted-foreground">{bet.match}</p>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="font-mono font-bold">@{bet.odds.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1 text-success">
                <DollarSign className="w-4 h-4" />
                <span className="font-mono font-bold">+{bet.netGain.toFixed(2)}€</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-sm font-medium ${
                  bet.confidence >= 80 ? 'text-success' : 
                  bet.confidence >= 60 ? 'text-warning' : 'text-muted-foreground'
                }`}>
                  {bet.confidence}%
                </span>
                <Progress value={bet.confidence} className="w-12 h-1.5" />
              </div>
            </div>

            <p className="text-sm text-muted-foreground italic">{bet.reasoning}</p>

            <Button
              onClick={() => handlePlaceBet(bet)}
              disabled={isPlaced || isPlacing || isUpdating}
              size="sm"
              variant={isPlaced ? "outline" : "default"}
              className={`w-full ${
                isPlaced 
                  ? 'bg-primary/10 border-primary/30 text-primary cursor-default' 
                  : ''
              }`}
            >
              {isPlacing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Placement...
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
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Icon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune opportunité trouvée</p>
            <p className="text-xs opacity-70">Données insuffisantes</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-success/20 to-primary/20">
              <ShoppingBasket className="w-6 h-6 text-success" />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                Le Panier du Soir
                <Badge variant="outline" className="text-xs font-normal">3 blocs</Badge>
              </h3>
              <p className="text-xs text-muted-foreground">
                SAFE • DUO • FUN — Stratégie de couverture
              </p>
            </div>
          </div>
          <Button 
            onClick={generateBasket} 
            disabled={isLoading}
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Génération...' : 'Générer le Panier'}
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
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
        {!basket && !isLoading && !error && (
          <div className="text-center py-8">
            <ShoppingBasket className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              Cliquez sur "Générer le Panier" pour le plan de la nuit
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              L'IA compose 3 paris: SAFE, DUO et FUN avec couverture
            </p>
          </div>
        )}

        {/* Evening Basket */}
        {basket && !isLoading && (
          <div className="space-y-6">
            {/* Coverage Banner */}
            <div className={`p-4 rounded-lg flex items-center gap-3 ${
              basket.isCovered 
                ? 'bg-success/10 border border-success/30' 
                : 'bg-warning/10 border border-warning/30'
            }`}>
              {basket.isCovered ? (
                <CheckCircle2 className="w-5 h-5 text-success" />
              ) : (
                <XCircle className="w-5 h-5 text-warning" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  basket.isCovered ? 'text-success' : 'text-warning'
                }`}>
                  {basket.isCovered ? 'Panier Couvert ✓' : 'Couverture Partielle'}
                </p>
                <p className="text-xs text-muted-foreground">{basket.coverageDetails}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Gain potentiel total</p>
                <p className="font-mono font-bold text-success">
                  +{(basket.totalPotentialGain - basket.totalStake).toFixed(2)}€
                </p>
              </div>
            </div>

            {/* 3 Blocks Grid */}
            <div className="grid gap-4 md:grid-cols-3">
              {renderBasketBlock(basket.safe, 'SAFE')}
              {renderBasketBlock(basket.duo, 'DUO')}
              {renderBasketBlock(basket.fun, 'FUN')}
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Coins className="w-4 h-4" />
                  <span className="text-xs">Mise Totale</span>
                </div>
                <p className="font-mono font-bold text-lg">{basket.totalStake.toFixed(2)}€</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs">Gain Potentiel</span>
                </div>
                <p className="font-mono font-bold text-lg text-success">
                  {basket.totalPotentialGain.toFixed(2)}€
                </p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs">ROI Potentiel</span>
                </div>
                <p className="font-mono font-bold text-lg text-primary">
                  +{(((basket.totalPotentialGain / basket.totalStake) - 1) * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                <p className="text-sm italic">{basket.summary}</p>
              </div>
            </div>

            {/* Timestamp */}
            <p className="text-xs text-muted-foreground text-center">
              Panier généré à {formatTime(basket.timestamp)}
            </p>
          </div>
        )}
      </Card>

      {/* Tonight's Bets Panel */}
      <TonightBetsPanel bets={tonightBets} />
    </div>
  );
}
