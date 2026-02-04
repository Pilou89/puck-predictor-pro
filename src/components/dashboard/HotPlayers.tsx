import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, TrendingUp, Zap } from "lucide-react";

interface HotPlayer {
  name: string;
  team: string;
  goalsLast5: number;
  pointsLast5: number;
  ppGoals: number;
  currentOdds?: number;
  duoPartner?: string;
}

interface HotPlayersProps {
  players: HotPlayer[];
}

export function HotPlayers({ players }: HotPlayersProps) {
  return (
    <Card className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-fire/20">
          <Flame className="w-5 h-5 text-fire" />
        </div>
        <div>
          <h3 className="font-semibold">Joueurs en Feu 🔥</h3>
          <p className="text-xs text-muted-foreground">Top performers des 5 derniers matchs</p>
        </div>
      </div>

      <div className="space-y-3">
        {players.map((player, index) => (
          <div
            key={player.name}
            className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-fire/20 to-destructive/20 flex items-center justify-center font-mono font-bold text-sm">
              {index + 1}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{player.name}</span>
                <span className="text-xs text-muted-foreground font-mono">{player.team}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {player.goalsLast5}G • {player.pointsLast5}P
                </span>
                {player.ppGoals > 0 && (
                  <Badge className="badge-pp text-[10px] px-1.5 py-0 h-4">
                    <Zap className="w-2.5 h-2.5 mr-0.5" />
                    {player.ppGoals} PP
                  </Badge>
                )}
                {player.duoPartner && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                    🤝 {player.duoPartner}
                  </Badge>
                )}
              </div>
            </div>

            {player.currentOdds && (
              <div className="text-right">
                <span className="font-mono font-bold text-primary">
                  {player.currentOdds.toFixed(2)}
                </span>
                <p className="text-[10px] text-muted-foreground">Cote But</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {players.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucune donnée disponible</p>
        </div>
      )}
    </Card>
  );
}
