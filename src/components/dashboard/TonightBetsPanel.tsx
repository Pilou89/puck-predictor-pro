import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Coins, 
  DollarSign, 
  TrendingUp,
  CheckCircle2,
  XCircle,
  Timer
} from "lucide-react";

interface TonightBet {
  id: string;
  match_name: string;
  bet_type: string;
  selection: string;
  odds: number;
  stake: number;
  potential_gain: number;
  outcome: 'pending' | 'won' | 'lost' | 'void';
  source: string;
}

interface TonightBetsPanelProps {
  bets: TonightBet[];
  isLoading?: boolean;
}

const BET_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  H2H: { label: 'Victoire', icon: '🏆' },
  GOAL_SCORER: { label: 'Buteur', icon: '⚽' },
  DUO: { label: 'Duo', icon: '👥' },
  POINTS_SOLO: { label: 'Points', icon: '📊' },
};

const OUTCOME_CONFIG = {
  pending: { 
    icon: Timer, 
    label: 'En cours', 
    className: 'bg-primary/20 text-primary border-primary/30' 
  },
  won: { 
    icon: CheckCircle2, 
    label: 'Gagné', 
    className: 'bg-success/20 text-success border-success/30' 
  },
  lost: { 
    icon: XCircle, 
    label: 'Perdu', 
    className: 'bg-destructive/20 text-destructive border-destructive/30' 
  },
  void: { 
    icon: Clock, 
    label: 'Annulé', 
    className: 'bg-muted text-muted-foreground border-muted' 
  },
};

export function TonightBetsPanel({ bets, isLoading }: TonightBetsPanelProps) {
  const pendingBets = bets.filter(b => b.outcome === 'pending');
  const totalStake = pendingBets.reduce((sum, b) => sum + b.stake, 0);
  const totalPotentialGain = pendingBets.reduce((sum, b) => sum + b.potential_gain, 0);

  if (bets.length === 0 && !isLoading) {
    return null; // Don't show panel if no bets tonight
  }

  return (
    <Card className="glass-card p-6 border-2 border-primary/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Mes Paris de la Nuit</h3>
            <p className="text-xs text-muted-foreground">
              {pendingBets.length} pari{pendingBets.length !== 1 ? 's' : ''} en cours
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Gain potentiel</p>
          <p className="font-mono font-bold text-lg text-success">
            +{totalPotentialGain.toFixed(2)}€
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-secondary/50 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Coins className="w-3 h-3" />
            <span className="text-xs">Mise engagée</span>
          </div>
          <p className="font-mono font-bold">{totalStake.toFixed(2)}€</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/50 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <TrendingUp className="w-3 h-3" />
            <span className="text-xs">Cote moyenne</span>
          </div>
          <p className="font-mono font-bold">
            @{pendingBets.length > 0 
              ? (pendingBets.reduce((sum, b) => sum + b.odds, 0) / pendingBets.length).toFixed(2) 
              : '0.00'}
          </p>
        </div>
      </div>

      {/* Bets List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {bets.map((bet) => {
          const typeInfo = BET_TYPE_LABELS[bet.bet_type] || { label: bet.bet_type, icon: '📌' };
          const outcomeConfig = OUTCOME_CONFIG[bet.outcome] || OUTCOME_CONFIG.pending;
          const OutcomeIcon = outcomeConfig.icon;

          return (
            <div 
              key={bet.id}
              className={`p-3 rounded-lg border transition-all ${
                bet.outcome === 'pending' 
                  ? 'bg-card border-primary/30 shadow-sm shadow-primary/10' 
                  : bet.outcome === 'won'
                  ? 'bg-success/5 border-success/30'
                  : bet.outcome === 'lost'
                  ? 'bg-destructive/5 border-destructive/30 opacity-60'
                  : 'bg-muted/50 border-muted opacity-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{typeInfo.icon}</span>
                    <Badge variant="outline" className="text-xs">
                      {typeInfo.label}
                    </Badge>
                    <Badge className={`${outcomeConfig.className} text-xs border`}>
                      <OutcomeIcon className="w-3 h-3 mr-1" />
                      {outcomeConfig.label}
                    </Badge>
                  </div>
                  <p className="font-medium text-sm">{bet.selection}</p>
                  <p className="text-xs text-muted-foreground">{bet.match_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">@{bet.odds.toFixed(2)}</p>
                  <p className="font-mono text-xs text-muted-foreground">{bet.stake.toFixed(2)}€</p>
                  <p className="font-mono text-xs text-success">+{bet.potential_gain.toFixed(2)}€</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <p className="text-xs text-muted-foreground text-center mt-4 italic">
        Validation automatique demain matin à 08:30
      </p>
    </Card>
  );
}
