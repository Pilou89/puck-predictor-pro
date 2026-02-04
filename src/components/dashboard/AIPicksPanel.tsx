import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Sparkles, TrendingUp, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface AIPick {
  player: string;
  team: string;
  match: string;
  odds: number;
  confidence: number;
  reasoning: string;
}

interface AIAnalysis {
  picks: AIPick[];
  analysis_summary: string;
}

export function AIPicksPanel() {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null);

  const runAnalysis = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-analysis');

      if (invokeError) {
        throw invokeError;
      }

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      setAnalysis(data.analysis);
      setLastAnalysis(new Date(data.timestamp));
      toast.success('Analyse IA terminée !');
    } catch (err) {
      console.error('AI Analysis error:', err);
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      toast.error(`Erreur: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 75) return 'text-success';
    if (confidence >= 60) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 75) return 'bg-success/20 text-success border-success/30';
    if (confidence >= 60) return 'bg-warning/20 text-warning border-warning/30';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              Le Choix de l'IA
              <Sparkles className="w-4 h-4 text-accent" />
            </h3>
            <p className="text-xs text-muted-foreground">
              Analyse des value bets par IA
            </p>
          </div>
        </div>
        <Button 
          onClick={runAnalysis} 
          disabled={isLoading}
          size="sm"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Analyse...' : 'Analyser'}
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
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
      {!analysis && !isLoading && !error && (
        <div className="text-center py-8">
          <Brain className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">
            Cliquez sur "Analyser" pour obtenir les recommandations IA
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            L'IA analyse les stats des joueurs et les cotes Winamax
          </p>
        </div>
      )}

      {/* Results */}
      {analysis && !isLoading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="p-4 rounded-lg bg-secondary/50 border border-border/50">
            <p className="text-sm text-muted-foreground italic">
              {analysis.analysis_summary}
            </p>
          </div>

          {/* Picks */}
          <div className="space-y-3">
            {analysis.picks.map((pick, index) => (
              <div 
                key={index}
                className="p-4 rounded-lg bg-card border border-border/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      #{index + 1}
                    </span>
                    <span className="font-semibold">{pick.player}</span>
                    <Badge variant="outline" className="text-xs">
                      {pick.team}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${getConfidenceBadge(pick.confidence)} border`}>
                      {pick.confidence}% confiance
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-2">
                  <span className="text-sm text-muted-foreground">{pick.match}</span>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-success" />
                    <span className="font-mono font-bold text-success">
                      @{pick.odds.toFixed(2)}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  {pick.reasoning}
                </p>
              </div>
            ))}
          </div>

          {/* Timestamp */}
          {lastAnalysis && (
            <p className="text-xs text-muted-foreground text-center">
              Dernière analyse: {lastAnalysis.toLocaleTimeString('fr-FR')}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
