import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Zap, Target } from "lucide-react";

interface ValueAlert {
  id: string;
  playerName: string;
  team: string;
  marketType: string;
  currentOdds: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  matchTime: Date;
}

interface ValueAlertsProps {
  alerts: ValueAlert[];
}

const confidenceConfig = {
  high: { color: "text-success", bg: "bg-success/10", label: "Haute" },
  medium: { color: "text-warning", bg: "bg-warning/10", label: "Moyenne" },
  low: { color: "text-muted-foreground", bg: "bg-muted/50", label: "Faible" },
};

export function ValueAlerts({ alerts }: ValueAlertsProps) {
  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Alertes Valeur</h3>
            <p className="text-xs text-muted-foreground">Opportunités détectées</p>
          </div>
        </div>
        <Badge variant="outline" className="font-mono">
          {alerts.length} actives
        </Badge>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => {
          const conf = confidenceConfig[alert.confidence];
          
          return (
            <div
              key={alert.id}
              className="p-4 rounded-lg border border-border bg-secondary/20 hover:border-primary/50 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{alert.playerName}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {alert.team}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {alert.marketType}
                    </Badge>
                    <span className="font-mono font-bold text-primary text-lg">
                      {alert.currentOdds.toFixed(2)}
                    </span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-warning" />
                    {alert.reason}
                  </p>
                </div>

                <div className="text-right">
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${conf.bg} ${conf.color}`}>
                    <TrendingUp className="w-3 h-3" />
                    {conf.label}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {alert.matchTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucune alerte active</p>
          <p className="text-xs">Les opportunités apparaîtront ici</p>
        </div>
      )}
    </Card>
  );
}
