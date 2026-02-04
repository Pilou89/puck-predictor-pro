import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PredictionStats } from "@/types/nhl";
import { TrendingUp, Target, Percent, DollarSign } from "lucide-react";

interface LearningPanelProps {
  stats: PredictionStats;
}

export function LearningPanel({ stats }: LearningPanelProps) {
  const winRatePercent = Math.round(stats.winRate * 100);
  const roiFormatted = stats.roi >= 0 ? `+${stats.roi.toFixed(1)}%` : `${stats.roi.toFixed(1)}%`;
  
  return (
    <Card className="glass-card p-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">Learning & Performance</h3>
          <p className="text-xs text-muted-foreground">Suivi des prédictions</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Win Rate */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Taux de Réussite</span>
            </div>
            <span className="font-mono font-bold text-lg">{winRatePercent}%</span>
          </div>
          <Progress value={winRatePercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {stats.wins} victoires sur {stats.totalPredictions} prédictions
          </p>
        </div>

        {/* ROI */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ROI Global</p>
              <p className={`font-mono font-bold text-xl ${stats.roi >= 0 ? 'text-success' : 'text-destructive'}`}>
                {roiFormatted}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Sur les 30 derniers jours</p>
          </div>
        </div>

        {/* Recent Performance */}
        <div>
          <p className="text-sm text-muted-foreground mb-3">Performance Récente</p>
          {stats.totalPredictions === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Aucun pari enregistré pour le moment
            </p>
          ) : (
            <div className="flex gap-1">
              {/* À connecter aux vrais résultats récents */}
            </div>
          )}
        </div>

        {/* Accuracy by Market */}
        <div>
          <p className="text-sm text-muted-foreground mb-3">Précision par Marché</p>
          {stats.totalPredictions === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Données disponibles après les premiers paris
            </p>
          ) : (
            <div className="space-y-2">
              {/* À calculer à partir des vraies données par type de marché */}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
