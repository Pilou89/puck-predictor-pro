import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBankroll } from "@/hooks/useBankroll";
import { TonightBetsPanel } from "./TonightBetsPanel";
import { TeamBet } from "./TeamPillarPanel";
import { PlayerBet } from "./PlayerPillarPanel";
import { 
  ShoppingBasket, 
  Shield, 
  Users, 
  Zap, 
  Check,
  Loader2,
  DollarSign,
  Coins,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Target,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";

interface StrategicBasketPanelProps {
  selectedTeamBets: TeamBet[];
  selectedPlayerBets: PlayerBet[];
  onClearSelection?: () => void;
}

const BASKET_CONFIG = {
  SAFE: { 
    emoji: '🛡️', 
    label: 'SAFE', 
    color: 'bg-success/20 text-success border-success/30',
    bgGradient: 'from-success/10 to-success/5',
    icon: Shield,
    stake: 2,
    description: 'Haute confiance',
  },
  DUO: { 
    emoji: '👥', 
    label: 'DUO', 
    color: 'bg-primary/20 text-primary border-primary/30',
    bgGradient: 'from-primary/10 to-primary/5',
    icon: Users,
    stake: 1,
    description: 'Synergie buteur-assistant',
  },
  FUN: { 
    emoji: '🎲', 
    label: 'FUN', 
    color: 'bg-warning/20 text-warning border-warning/30',
    bgGradient: 'from-warning/10 to-warning/5',
    icon: Zap,
    stake: 1,
    description: 'Risque modéré',
  },
  SUPER_COMBO: { 
    emoji: '🎰', 
    label: 'SUPER COMBO', 
    color: 'bg-accent/20 text-accent border-accent/30',
    bgGradient: 'from-accent/10 to-accent/5',
    icon: Sparkles,
    stake: 0.5,
    description: 'Grosse cote combinée',
  },
};

interface BasketBet {
  id: string;
  basketType: 'SAFE' | 'DUO' | 'FUN' | 'SUPER_COMBO';
  source: 'team' | 'player';
  selection: string;
  match: string;
  odds: number;
  stake: number;
  potentialGain: number;
  confidence?: number;
  betType: string;
  reasoning: string;
}

export function StrategicBasketPanel({ 
  selectedTeamBets, 
  selectedPlayerBets,
  onClearSelection 
}: StrategicBasketPanelProps) {
  const { stats, addBet, isUpdating } = useBankroll();
  const [placingBetId, setPlacingBetId] = useState<string | null>(null);
  const [placedBetIds, setPlacedBetIds] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().split('T')[0];
  const tonightBets = stats.betsHistory.filter(bet => bet.bet_date === today);

  // Compose the evening basket from selections - memoized
  const composedBasket = React.useMemo(() => 
    composeBasket(selectedTeamBets, selectedPlayerBets),
    [selectedTeamBets, selectedPlayerBets]
  );

  // Check for already placed bets - stable effect
  const tonightBetsKey = tonightBets.map(t => t.id).join(',');
  const composedBasketKey = composedBasket.map(b => b.id).join(',');
  
  useEffect(() => {
    const alreadyPlaced = new Set<string>();
    
    tonightBets.forEach(tb => {
      composedBasket.forEach(bet => {
        if (tb.selection === bet.selection && tb.match_name === bet.match) {
          alreadyPlaced.add(bet.id);
        }
      });
    });
    
    setPlacedBetIds(alreadyPlaced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tonightBetsKey, composedBasketKey]);

  const handlePlaceBet = async (bet: BasketBet) => {
    if (placedBetIds.has(bet.id) || placingBetId === bet.id) return;

    setPlacingBetId(bet.id);

    try {
      addBet({
        bet_date: today,
        match_name: bet.match,
        bet_type: bet.betType,
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

  const handlePlaceAll = async () => {
    const betsToPlace = composedBasket.filter(b => !placedBetIds.has(b.id));
    for (const bet of betsToPlace) {
      await handlePlaceBet(bet);
    }
  };

  // Calculate totals
  const totalStake = composedBasket.reduce((sum, b) => sum + b.stake, 0);
  const totalPotentialGain = composedBasket.reduce((sum, b) => sum + b.potentialGain, 0);
  const safeBet = composedBasket.find(b => b.basketType === 'SAFE');
  const isCovered = safeBet ? safeBet.potentialGain >= totalStake : false;

  const renderBetBlock = (bet: BasketBet | undefined, type: 'SAFE' | 'DUO' | 'FUN' | 'SUPER_COMBO') => {
    const config = BASKET_CONFIG[type];
    const Icon = config.icon;
    const isPlaced = bet ? placedBetIds.has(bet.id) : false;
    const isPlacing = bet ? placingBetId === bet.id : false;

    return (
      <div 
        className={`relative p-4 rounded-xl border-2 transition-all ${
          isPlaced 
            ? 'border-primary/50 ring-2 ring-primary/20' 
            : 'border-border/50'
        } bg-gradient-to-br ${config.bgGradient}`}
      >
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
              <p className="text-xs text-muted-foreground">Mise</p>
              <p className="font-mono font-bold">{bet.stake.toFixed(2)}€</p>
            </div>
          )}
        </div>

        {bet ? (
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {bet.source === 'team' ? 'Équipe' : 'Joueur'}
                </Badge>
                {isPlaced && (
                  <Badge className="bg-primary/20 text-primary border-primary/30 border text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    Placé
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
                <span className="font-mono font-bold">+{(bet.potentialGain - bet.stake).toFixed(2)}€</span>
              </div>
              {bet.confidence && (
                <div className="flex items-center gap-1">
                  <span className={`text-sm font-medium ${
                    bet.confidence >= 80 ? 'text-success' : 
                    bet.confidence >= 60 ? 'text-warning' : 'text-muted-foreground'
                  }`}>
                    {bet.confidence}%
                  </span>
                  <Progress value={bet.confidence} className="w-12 h-1.5" />
                </div>
              )}
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
            <p className="text-sm">Sélectionnez depuis les piliers</p>
            <p className="text-xs opacity-70">
              {type === 'SAFE' && 'Équipe 1.40-1.80 ou Joueur confiance ≥85%'}
              {type === 'DUO' && 'Joueur avec duo performant'}
              {type === 'FUN' && 'Équipe ou joueur cote 1.80-4.50'}
              {type === 'SUPER_COMBO' && 'Équipe ou joueur cote ≥4.50'}
            </p>
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
                Panier Stratégique du Soir
                <Badge variant="outline" className="text-xs font-normal">
                  {composedBasket.length}/4 paris
                </Badge>
              </h3>
              <p className="text-xs text-muted-foreground">
                SAFE • DUO • FUN • SUPER COMBO — Équipes + Joueurs
              </p>
            </div>
          </div>
          {composedBasket.length > 0 && (
            <div className="flex gap-2">
              <Button 
                onClick={onClearSelection}
                size="sm"
                variant="outline"
              >
                Vider
              </Button>
              <Button 
                onClick={handlePlaceAll}
                disabled={composedBasket.every(b => placedBetIds.has(b.id)) || isUpdating}
                size="sm"
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Placer tout
              </Button>
            </div>
          )}
        </div>

        {/* Coverage Banner */}
        {composedBasket.length > 0 && (
          <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${
            isCovered 
              ? 'bg-success/10 border border-success/30' 
              : 'bg-warning/10 border border-warning/30'
          }`}>
            {isCovered ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <XCircle className="w-5 h-5 text-warning" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                isCovered ? 'text-success' : 'text-warning'
              }`}>
                {isCovered ? 'Panier Couvert ✓' : 'Couverture Partielle'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isCovered 
                  ? `Le pari SAFE couvre la mise totale (${totalStake.toFixed(2)}€)`
                  : 'Ajoutez un pari SAFE pour couvrir les mises'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Gain net potentiel</p>
              <p className="font-mono font-bold text-success">
                +{(totalPotentialGain - totalStake).toFixed(2)}€
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {composedBasket.length === 0 && (
          <div className="text-center py-8 mb-6">
            <ShoppingBasket className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              Sélectionnez des paris depuis les piliers ci-dessus
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Équipes (H2H auto) + Joueurs (cotes manuelles) = Panier optimal
            </p>
          </div>
        )}

        {/* 4 Blocks Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {renderBetBlock(composedBasket.find(b => b.basketType === 'SAFE'), 'SAFE')}
          {renderBetBlock(composedBasket.find(b => b.basketType === 'DUO'), 'DUO')}
          {renderBetBlock(composedBasket.find(b => b.basketType === 'FUN'), 'FUN')}
          {renderBetBlock(composedBasket.find(b => b.basketType === 'SUPER_COMBO'), 'SUPER_COMBO')}
        </div>

        {/* Summary Stats */}
        {composedBasket.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Coins className="w-4 h-4" />
                <span className="text-xs">Mise Totale</span>
              </div>
              <p className="font-mono font-bold text-lg">{totalStake.toFixed(2)}€</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs">Gain Potentiel</span>
              </div>
              <p className="font-mono font-bold text-lg text-success">
                {totalPotentialGain.toFixed(2)}€
              </p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs">ROI Potentiel</span>
              </div>
              <p className="font-mono font-bold text-lg text-primary">
                +{totalStake > 0 ? (((totalPotentialGain / totalStake) - 1) * 100).toFixed(0) : 0}%
              </p>
            </div>
          </div>
        )}

        {/* Info */}
        {composedBasket.length > 0 && (
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mt-6">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-primary mt-0.5" />
              <p className="text-sm italic">
                Stratégie hybride avec 4 blocs : SAFE couvre les pertes, DUO exploite les synergies,
                FUN offre un risque modéré, et SUPER COMBO maximise les gains potentiels.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Tonight's Bets Panel */}
      <TonightBetsPanel bets={tonightBets} />
    </div>
  );
}

// Compose basket from selected bets
function composeBasket(teamBets: TeamBet[], playerBets: PlayerBet[]): BasketBet[] {
  const basket: BasketBet[] = [];

  // Find best SAFE option
  const safeCandidates = [
    ...teamBets
      .filter(t => t.type === 'SAFE')
      .map(t => ({ 
        id: t.id,
        source: 'team' as const, 
        selection: t.selection,
        match: t.match,
        odds: t.odds,
        confidence: t.confidence || 80,
        betType: 'H2H',
        reasoning: t.reasoning,
      })),
    ...playerBets
      .filter(p => p.manualOdds && p.category === 'SAFE')
      .map(p => ({
        id: p.id,
        source: 'player' as const,
        selection: p.player.name,
        match: p.player.match,
        odds: p.manualOdds!,
        confidence: p.player.confidence,
        betType: p.player.betType,
        reasoning: p.player.reasoning,
      })),
  ].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  if (safeCandidates[0]) {
    const safe = safeCandidates[0];
    basket.push({
      id: safe.id,
      basketType: 'SAFE',
      source: safe.source,
      selection: safe.selection,
      match: safe.match,
      odds: safe.odds,
      stake: BASKET_CONFIG.SAFE.stake,
      potentialGain: BASKET_CONFIG.SAFE.stake * safe.odds,
      confidence: safe.confidence,
      betType: safe.betType,
      reasoning: safe.reasoning,
    });
  }

  // Find DUO option (player with duo partner)
  const duoCandidate = playerBets.find(p => p.player.duoPartner && p.manualOdds);
  if (duoCandidate && duoCandidate.manualOdds) {
    basket.push({
      id: duoCandidate.id + '-duo',
      basketType: 'DUO',
      source: 'player',
      selection: `${duoCandidate.player.name} + ${duoCandidate.player.duoPartner}`,
      match: duoCandidate.player.match,
      odds: duoCandidate.manualOdds,
      stake: BASKET_CONFIG.DUO.stake,
      potentialGain: BASKET_CONFIG.DUO.stake * duoCandidate.manualOdds,
      confidence: duoCandidate.player.confidence,
      betType: 'DUO',
      reasoning: duoCandidate.player.reasoning,
    });
  }

  // Find FUN option (team or player with odds 1.80-4.50)
  const funCandidates = [
    ...teamBets
      .filter(t => t.type === 'FUN')
      .map(t => ({ 
        id: t.id,
        source: 'team' as const, 
        selection: t.selection,
        match: t.match,
        odds: t.odds,
        confidence: t.confidence || 60,
        betType: 'H2H',
        reasoning: t.reasoning,
      })),
    ...playerBets
      .filter(p => p.manualOdds && p.category === 'FUN')
      .map(p => ({
        id: p.id,
        source: 'player' as const,
        selection: p.player.name,
        match: p.player.match,
        odds: p.manualOdds!,
        confidence: p.player.confidence,
        betType: p.player.betType,
        reasoning: p.player.reasoning,
      })),
  ].sort((a, b) => b.odds - a.odds);

  if (funCandidates[0]) {
    const fun = funCandidates[0];
    basket.push({
      id: fun.id,
      basketType: 'FUN',
      source: fun.source,
      selection: fun.selection,
      match: fun.match,
      odds: fun.odds,
      stake: BASKET_CONFIG.FUN.stake,
      potentialGain: BASKET_CONFIG.FUN.stake * fun.odds,
      confidence: fun.confidence,
      betType: fun.betType,
      reasoning: fun.reasoning,
    });
  }

  // Find SUPER COMBO option (team or player with odds >= 4.50)
  const superComboCandidates = [
    ...teamBets
      .filter(t => t.type === 'SUPER_COMBO')
      .map(t => ({ 
        id: t.id,
        source: 'team' as const, 
        selection: t.selection,
        match: t.match,
        odds: t.odds,
        confidence: t.confidence || 40,
        betType: 'H2H_OUTSIDER',
        reasoning: t.reasoning,
      })),
    ...playerBets
      .filter(p => p.manualOdds && p.category === 'SUPER_COMBO')
      .map(p => ({
        id: p.id,
        source: 'player' as const,
        selection: p.player.name,
        match: p.player.match,
        odds: p.manualOdds!,
        confidence: p.player.confidence,
        betType: p.player.betType,
        reasoning: p.player.reasoning,
      })),
  ].sort((a, b) => b.odds - a.odds);

  if (superComboCandidates[0]) {
    const superCombo = superComboCandidates[0];
    basket.push({
      id: superCombo.id,
      basketType: 'SUPER_COMBO',
      source: superCombo.source,
      selection: superCombo.selection,
      match: superCombo.match,
      odds: superCombo.odds,
      stake: BASKET_CONFIG.SUPER_COMBO.stake,
      potentialGain: BASKET_CONFIG.SUPER_COMBO.stake * superCombo.odds,
      confidence: superCombo.confidence,
      betType: superCombo.betType,
      reasoning: superCombo.reasoning,
    });
  }

  return basket;
}
