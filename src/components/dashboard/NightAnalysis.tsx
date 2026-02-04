import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Moon, TrendingUp, Battery, AlertCircle, Zap, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyzedMatch {
  id: string;
  homeTeam: {
    abbr: string;
    name: string;
    isB2B: boolean;
    pimPerGame: number;
  };
  awayTeam: {
    abbr: string;
    name: string;
    isB2B: boolean;
    pimPerGame: number;
  };
  startTime: Date;
  advantageScore: number;
  advantageTeam: 'home' | 'away';
  reasons: string[];
  bestOdds?: number;
}

interface NightAnalysisProps {
  matches: AnalyzedMatch[];
}

function getConfidenceLevel(score: number): { label: string; color: string } {
  if (score >= 25) return { label: "Très élevé", color: "text-green-400" };
  if (score >= 18) return { label: "Élevé", color: "text-primary" };
  if (score >= 12) return { label: "Modéré", color: "text-yellow-400" };
  return { label: "Faible", color: "text-muted-foreground" };
}

export function NightAnalysis({ matches }: NightAnalysisProps) {
  if (matches.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Moon className="w-5 h-5 text-primary" />
            Analyse de la Nuit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Aucun match avec avantage statistique significatif ce soir.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Moon className="w-5 h-5 text-primary" />
            Analyse de la Nuit
          </CardTitle>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            Top {matches.length} matchs
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Matchs avec le plus fort avantage statistique (B2B + PIM + Cotes)
        </p>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {matches.map((match, index) => {
          const confidence = getConfidenceLevel(match.advantageScore);
          const favoredTeam = match.advantageTeam === 'home' ? match.homeTeam : match.awayTeam;
          const weakTeam = match.advantageTeam === 'home' ? match.awayTeam : match.homeTeam;

          return (
            <div
              key={match.id}
              className={cn(
                "relative p-4 rounded-lg border transition-all hover:border-primary/50",
                index === 0 
                  ? "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/30" 
                  : "bg-muted/30 border-border/50"
              )}
            >
              {/* Rank badge */}
              <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                {index + 1}
              </div>

              {/* Match header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {match.awayTeam.abbr} @ {match.homeTeam.abbr}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {match.startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className={cn("w-4 h-4", confidence.color)} />
                  <span className={cn("text-sm font-medium", confidence.color)}>
                    {confidence.label}
                  </span>
                </div>
              </div>

              {/* Advantage indicator */}
              <div className="flex items-center gap-3 mb-3 p-2 rounded-md bg-background/50">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-sm">
                  Avantage <span className="font-semibold text-primary">{favoredTeam.abbr}</span>
                  {" "}vs {weakTeam.abbr}
                </span>
                <span className="ml-auto text-xs font-mono bg-primary/20 text-primary px-2 py-0.5 rounded">
                  Score: {match.advantageScore}
                </span>
              </div>

              {/* Reasons */}
              <div className="flex flex-wrap gap-2">
                {match.reasons.map((reason, i) => {
                  let icon = <Zap className="w-3 h-3" />;
                  let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
                  
                  if (reason.includes("B2B")) {
                    icon = <Battery className="w-3 h-3" />;
                    variant = "outline";
                  } else if (reason.includes("PIM")) {
                    icon = <AlertCircle className="w-3 h-3" />;
                    variant = "destructive";
                  }

                  return (
                    <Badge key={i} variant={variant} className="text-xs gap-1">
                      {icon}
                      {reason}
                    </Badge>
                  );
                })}
              </div>

              {/* Best odds if available */}
              {match.bestOdds && (
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cote Winamax</span>
                  <span className="font-mono text-primary font-semibold">
                    {match.bestOdds.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
