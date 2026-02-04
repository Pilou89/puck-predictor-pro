import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PredictionStats } from "@/types/nhl";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Target, DollarSign, Brain, RefreshCw, BarChart3, Users } from "lucide-react";

interface LearningMetric {
  metric_type: string;
  metric_key: string;
  wins: number;
  total: number;
  roi: number;
  confidence_adjustment: number;
}

interface LearningPanelProps {
  stats: PredictionStats;
}

export function LearningPanel({ stats }: LearningPanelProps) {
  const [metrics, setMetrics] = useState<LearningMetric[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const winRatePercent = Math.round(stats.winRate * 100);
  const roiFormatted = stats.roi >= 0 ? `+${stats.roi.toFixed(1)}%` : `${stats.roi.toFixed(1)}%`;
  
  const fetchLearningMetrics = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('learning_metrics')
        .select('*')
        .order('total', { ascending: false })
        .limit(20);

      if (error) throw error;
      setMetrics(data || []);
    } catch (err) {
      console.error('Error fetching learning metrics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerLearning = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('learn-from-results');
      if (error) throw error;
      await fetchLearningMetrics();
    } catch (err) {
      console.error('Error triggering learning:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLearningMetrics();
  }, []);

  const marketMetrics = metrics.filter(m => m.metric_type === 'market');
  const teamMetrics = metrics.filter(m => m.metric_type === 'team').slice(0, 5);
  const playerMetrics = metrics.filter(m => m.metric_type === 'player').slice(0, 5);
  const contextMetrics = metrics.filter(m => m.metric_type === 'context');

  const getWinRateColor = (wins: number, total: number) => {
    if (total === 0) return 'text-muted-foreground';
    const rate = wins / total;
    if (rate >= 0.6) return 'text-success';
    if (rate >= 0.4) return 'text-warning';
    return 'text-destructive';
  };

  const getAdjustmentBadge = (adjustment: number) => {
    if (adjustment === 0) return null;
    return (
      <Badge className={`text-xs ${adjustment > 0 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
        {adjustment > 0 ? '+' : ''}{adjustment}%
      </Badge>
    );
  };

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Apprentissage IA</h3>
            <p className="text-xs text-muted-foreground">Ajustements basés sur les résultats</p>
          </div>
        </div>
        <Button 
          onClick={triggerLearning}
          disabled={isLoading}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Apprendre
        </Button>
      </div>

      <div className="space-y-6">
        {/* Global Performance */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Taux de Réussite</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-2xl">{winRatePercent}%</span>
              <Progress value={winRatePercent} className="flex-1 h-2" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.wins}/{stats.totalPredictions} paris gagnés
            </p>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">ROI Global</span>
            </div>
            <p className={`font-mono font-bold text-2xl ${stats.roi >= 0 ? 'text-success' : 'text-destructive'}`}>
              {roiFormatted}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Sur les 30 derniers jours
            </p>
          </div>
        </div>

        {/* Market Performance */}
        {marketMetrics.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Performance par Marché</span>
            </div>
            <div className="space-y-2">
              {marketMetrics.map(m => (
                <div key={m.metric_key} className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{m.metric_key}</Badge>
                    {getAdjustmentBadge(m.confidence_adjustment)}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className={getWinRateColor(m.wins, m.total)}>
                      {m.total > 0 ? Math.round((m.wins / m.total) * 100) : 0}%
                    </span>
                    <span className="text-muted-foreground">
                      {m.wins}/{m.total}
                    </span>
                    <span className={m.roi >= 0 ? 'text-success' : 'text-destructive'}>
                      {m.roi >= 0 ? '+' : ''}{m.roi.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Performance */}
        {teamMetrics.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Top Équipes</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {teamMetrics.map(m => (
                <div key={m.metric_key} className="p-2 rounded-lg bg-card/50 border border-border/50 text-center">
                  <Badge variant="outline" className="text-xs mb-1">{m.metric_key}</Badge>
                  <p className={`font-mono text-sm ${getWinRateColor(m.wins, m.total)}`}>
                    {m.total > 0 ? Math.round((m.wins / m.total) * 100) : 0}%
                  </p>
                  {getAdjustmentBadge(m.confidence_adjustment)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Context Insights */}
        {contextMetrics.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Facteurs Contextuels</span>
            </div>
            <div className="space-y-2">
              {contextMetrics.map(m => (
                <div key={m.metric_key} className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{formatContextKey(m.metric_key)}</span>
                    {getAdjustmentBadge(m.confidence_adjustment)}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className={getWinRateColor(m.wins, m.total)}>
                      {m.total > 0 ? Math.round((m.wins / m.total) * 100) : 0}% win
                    </span>
                    <span className="text-muted-foreground">
                      ({m.total} paris)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {metrics.length === 0 && !isLoading && (
          <div className="text-center py-8">
            <Brain className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Aucune métrique d'apprentissage</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Cliquez sur "Apprendre" après avoir placé et validé des paris
            </p>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {/* Learning Status */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-2">
            <Brain className="w-4 h-4 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-primary mb-1">Système d'Apprentissage Actif</p>
              <p className="text-muted-foreground text-xs">
                L'IA ajuste automatiquement les scores de confiance en fonction des résultats passés.
                Les équipes et marchés avec un meilleur historique reçoivent un bonus de confiance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function formatContextKey(key: string): string {
  const labels: Record<string, string> = {
    'b2b_opponent': 'Adversaire en B2B',
    'high_pim_opponent': 'Adversaire indiscipliné (PIM élevé)',
    'duo_active': 'Duo performant actif',
    'home_team': 'Équipe à domicile',
    'away_team': 'Équipe à l\'extérieur',
  };
  return labels[key] || key.replace(/_/g, ' ');
}
