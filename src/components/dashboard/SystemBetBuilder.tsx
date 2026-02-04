import React, { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Layers,
  X,
  Calculator,
  DollarSign,
  TrendingUp,
  Check,
  Loader2,
  Sparkles,
  Target,
  Users,
  Brain,
  RefreshCw,
  Zap,
  Shield,
  ChevronRight,
  Trophy,
  Percent
} from "lucide-react";
import { toast } from "sonner";
import { useBankroll } from "@/hooks/useBankroll";
import { supabase } from "@/integrations/supabase/client";

interface PlayerSelection {
  name: string;
  team: string;
  match: string;
  betType: 'Buteur' | 'Point' | 'But+Passe';
  estimatedOdds: number;
  reason: string;
  learningScore: number;
}

interface AIPlayerCombo {
  name: string;
  type: 'SAFE' | 'FUN' | 'SUPER_COMBO';
  systemType: string;
  stakePerCombo: number;
  totalStake: number;
  selections: PlayerSelection[];
  combinationsCount: number;
  potentialGains: {
    min: number;
    max: number;
  };
  minRecoveryPercent?: number;
  confidence: number;
  reasoning: string;
}

interface SystemBetBuilderProps {
  onClose?: () => void;
}

// Calculate combinations (n choose k)
function combinations(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

export function SystemBetBuilder({ onClose }: SystemBetBuilderProps) {
  const { addBet, isUpdating } = useBankroll();
  
  // AI Suggestions state
  const [aiCombos, setAiCombos] = useState<AIPlayerCombo[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState<string | null>(null);
  
  // Editable stakes per combo type
  const [editableStakes, setEditableStakes] = useState<Record<string, number>>({});

  // Fetch AI suggestions on mount
  const fetchAISuggestions = async () => {
    setIsLoadingAI(true);
    setAiError(null);

    try {
      const { data, error } = await supabase.functions.invoke('suggest-combo');
      
      if (error) {
        console.error('AI Suggestion error:', error);
        throw new Error(error.message || 'Erreur lors de la génération des suggestions');
      }

      if (data?.success && data.combos) {
        setAiCombos(data.combos);
        setAiAnalysis(data.analysis || '');
        
        // Initialize editable stakes
        const stakes: Record<string, number> = {};
        data.combos.forEach((c: AIPlayerCombo) => {
          stakes[c.type] = c.stakePerCombo || 0.50;
        });
        setEditableStakes(stakes);
        
        if (data.combos.length > 0) {
          toast.success(`${data.combos.length} combinaisons JOUEURS générées ! 🎰`);
        }
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Failed to fetch AI suggestions:', err);
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setAiError(message);
      toast.error(message);
    } finally {
      setIsLoadingAI(false);
    }
  };

  useEffect(() => {
    fetchAISuggestions();
  }, []);

  // Recalculate gains when stake changes
  const getRecalculatedCombo = (combo: AIPlayerCombo): AIPlayerCombo => {
    const stakePerCombo = editableStakes[combo.type] || combo.stakePerCombo;
    const totalStake = stakePerCombo * combo.combinationsCount;
    
    const systemParts = combo.systemType.split('/');
    const required = parseInt(systemParts[0]) || 2;
    
    const allOdds = combo.selections.map(s => s.estimatedOdds);
    
    // Recalculate gains
    let minGain = 0;
    let maxGain = 0;
    
    if (allOdds.length >= required) {
      const sortedOdds = [...allOdds].sort((a, b) => a - b);
      const minComboOdds = sortedOdds.slice(0, required).reduce((acc, o) => acc * o, 1);
      minGain = stakePerCombo * minComboOdds;
      
      // Generate all combinations for max gain
      const generateCombos = (arr: number[], k: number): number[][] => {
        if (k === 0) return [[]];
        if (arr.length < k) return [];
        const [first, ...rest] = arr;
        const withFirst = generateCombos(rest, k - 1).map(c => [first, ...c]);
        const withoutFirst = generateCombos(rest, k);
        return [...withFirst, ...withoutFirst];
      };
      const allCombos = generateCombos(allOdds, required);
      maxGain = allCombos.reduce((sum, c) => {
        const comboOdds = c.reduce((acc, o) => acc * o, 1);
        return sum + (stakePerCombo * comboOdds);
      }, 0);
    }

    return {
      ...combo,
      stakePerCombo,
      totalStake,
      potentialGains: {
        min: parseFloat(minGain.toFixed(2)),
        max: parseFloat(maxGain.toFixed(2)),
      }
    };
  };

  const handlePlaceCombo = async (combo: AIPlayerCombo) => {
    setIsPlacing(combo.type);
    const today = new Date().toISOString().split('T')[0];
    const recalcCombo = getRecalculatedCombo(combo);

    try {
      const selectionsStr = combo.selections.map(s => `${s.name} (${s.betType})`).join(' + ');
      const systemDetails = `[${combo.type}] [SYSTÈME ${combo.systemType}] ${selectionsStr}`;
      
      addBet({
        bet_date: today,
        match_name: combo.selections.map(s => s.match).join(' | '),
        bet_type: `SYSTEM_${combo.systemType.replace('/', '_')}`,
        selection: selectionsStr,
        odds: combo.selections.reduce((acc, s) => acc * s.estimatedOdds, 1),
        stake: recalcCombo.totalStake,
        potential_gain: recalcCombo.potentialGains.max,
        outcome: 'pending',
        actual_gain: 0,
        source: 'ai_suggestion',
        notes: `${systemDetails}\n${combo.combinationsCount} combinaisons @ ${recalcCombo.stakePerCombo.toFixed(2)}€/combo\nJoueurs: ${combo.selections.map(s => `${s.name} @${s.estimatedOdds} - ${s.reason}`).join('\n')}\nConfiance IA: ${combo.confidence}%`,
      });

      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{combo.name} placé ! 🎰</span>
          <span className="text-sm opacity-80">{combo.selections.length} joueurs • {recalcCombo.totalStake.toFixed(2)}€</span>
        </div>
      );
      
      if (onClose) onClose();
    } catch (err) {
      console.error('Error placing combo:', err);
      toast.error('Erreur lors du placement du combo');
    } finally {
      setIsPlacing(null);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SAFE': return Shield;
      case 'FUN': return Zap;
      case 'SUPER_COMBO': return Sparkles;
      default: return Target;
    }
  };

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'SAFE': 
        return {
          bg: 'bg-success/10',
          border: 'border-success/30',
          text: 'text-success',
          badge: 'bg-success/20 text-success border-success/30',
          gradient: 'from-success/20 to-success/5',
        };
      case 'FUN': 
        return {
          bg: 'bg-warning/10',
          border: 'border-warning/30',
          text: 'text-warning',
          badge: 'bg-warning/20 text-warning border-warning/30',
          gradient: 'from-warning/20 to-warning/5',
        };
      case 'SUPER_COMBO': 
        return {
          bg: 'bg-accent/10',
          border: 'border-accent/30',
          text: 'text-accent',
          badge: 'bg-accent/20 text-accent border-accent/30',
          gradient: 'from-accent/20 to-accent/5',
        };
      default: 
        return {
          bg: 'bg-muted',
          border: 'border-border',
          text: 'text-muted-foreground',
          badge: 'bg-muted text-muted-foreground',
          gradient: 'from-muted to-background',
        };
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'SAFE': return 'Récupération mise';
      case 'FUN': return 'Équilibre risque/gain';
      case 'SUPER_COMBO': return 'Gros gains';
      default: return '';
    }
  };

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-accent/20 to-primary/20">
            <Layers className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              Super Combo IA - Joueurs
              <Badge className="bg-accent/20 text-accent border-accent/30 border text-xs">
                100% Auto
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              L'IA analyse et propose 3 combinaisons joueurs optimales
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchAISuggestions}
            disabled={isLoadingAI}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingAI ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* AI Analysis Summary */}
      {aiAnalysis && !isLoadingAI && (
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mb-6">
          <div className="flex items-start gap-2">
            <Brain className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium text-primary mb-1">Analyse IA du soir</p>
              <p className="text-sm text-muted-foreground">{aiAnalysis}</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Loading State */}
      {isLoadingAI && (
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm">L'IA analyse les joueurs en forme et l'historique...</span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      )}

      {/* AI Error */}
      {aiError && !isLoadingAI && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 mb-6">
          <p className="text-sm text-destructive">{aiError}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchAISuggestions} 
            className="mt-2"
          >
            Réessayer
          </Button>
        </div>
      )}

      {/* 3 AI Combo Cards */}
      {!isLoadingAI && aiCombos.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {aiCombos.map((combo) => {
            const TypeIcon = getTypeIcon(combo.type);
            const styles = getTypeStyles(combo.type);
            const recalcCombo = getRecalculatedCombo(combo);
            
            return (
              <div 
                key={combo.type}
                className={`rounded-xl border-2 ${styles.border} ${styles.bg} overflow-hidden transition-all hover:ring-2 hover:ring-primary/20`}
              >
                {/* Header */}
                <div className={`p-4 bg-gradient-to-r ${styles.gradient}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TypeIcon className={`w-5 h-5 ${styles.text}`} />
                      <span className={`font-bold ${styles.text}`}>
                        {combo.type === 'SUPER_COMBO' ? 'SUPER' : combo.type}
                      </span>
                    </div>
                    <Badge variant="outline" className={`font-mono text-xs ${styles.badge}`}>
                      Système {combo.systemType}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{getTypeLabel(combo.type)}</p>
                </div>

                {/* Selections */}
                <div className="p-4 space-y-2">
                  {combo.selections.map((sel, i) => (
                    <div 
                      key={i}
                      className="p-2 rounded-lg bg-background/50 border border-border/50"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full ${styles.bg} flex items-center justify-center text-xs font-bold ${styles.text}`}>
                            {i + 1}
                          </div>
                          <span className="font-medium text-sm truncate max-w-[120px]">{sel.name}</span>
                        </div>
                        <Badge variant="secondary" className="font-mono text-xs">
                          @{sel.estimatedOdds.toFixed(2)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground ml-7">
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {sel.betType}
                        </Badge>
                        <span className="truncate">{sel.match}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-7 italic line-clamp-1">
                        {sel.reason}
                      </p>
                    </div>
                  ))}
                </div>

                {/* SAFE Recovery Indicator */}
                {combo.type === 'SAFE' && combo.minRecoveryPercent && (
                  <div className="px-4 pb-2">
                    <div className="p-2 rounded-lg bg-success/10 border border-success/20 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-success" />
                      <p className="text-xs text-success font-medium">
                        Si {combo.systemType.split('/')[0]} joueurs passent: récup ~{combo.minRecoveryPercent}% mise
                      </p>
                    </div>
                  </div>
                )}

                {/* Stake Editor */}
                <div className="px-4 pb-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">Mise/combo:</label>
                    <Input
                      type="number"
                      step="0.10"
                      min="0.10"
                      value={editableStakes[combo.type] || combo.stakePerCombo}
                      onChange={(e) => setEditableStakes(prev => ({
                        ...prev,
                        [combo.type]: parseFloat(e.target.value) || 0.50
                      }))}
                      className="h-7 w-20 font-mono text-sm"
                    />
                    <span className="text-xs text-muted-foreground">€</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="p-4 pt-2 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Combinaisons</p>
                    <p className="font-mono font-bold">{combo.combinationsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mise totale</p>
                    <p className="font-mono font-bold">{recalcCombo.totalStake.toFixed(2)}€</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Confiance</p>
                    <p className={`font-bold ${combo.confidence >= 70 ? 'text-success' : combo.confidence >= 50 ? 'text-warning' : 'text-muted-foreground'}`}>
                      {combo.confidence}%
                    </p>
                  </div>
                </div>

                {/* Potential Gains */}
                <div className="px-4 pb-4">
                  <div className={`p-3 rounded-lg bg-gradient-to-r ${styles.gradient} border ${styles.border}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Gains potentiels</span>
                      </div>
                      <Trophy className={`w-4 h-4 ${styles.text}`} />
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Min ({combo.systemType.split('/')[0]} gagnants)</p>
                        <p className="font-mono font-bold text-lg">{recalcCombo.potentialGains.min.toFixed(2)}€</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Max (tous gagnants)</p>
                        <p className={`font-mono font-bold text-lg ${styles.text}`}>{recalcCombo.potentialGains.max.toFixed(2)}€</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reasoning */}
                <div className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground italic line-clamp-2">
                    💡 {combo.reasoning}
                  </p>
                </div>

                {/* Place Button */}
                <div className="p-4 pt-0">
                  <Button 
                    onClick={() => handlePlaceCombo(combo)}
                    disabled={isPlacing === combo.type || isUpdating}
                    className={`w-full gap-2 ${combo.type === 'SAFE' ? 'bg-success hover:bg-success/90' : combo.type === 'FUN' ? 'bg-warning hover:bg-warning/90 text-warning-foreground' : 'bg-accent hover:bg-accent/90'}`}
                  >
                    {isPlacing === combo.type ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Placement...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Placer ({recalcCombo.totalStake.toFixed(2)}€)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No combos */}
      {!isLoadingAI && aiCombos.length === 0 && !aiError && (
        <div className="p-8 rounded-lg bg-muted/50 border border-border/50 text-center">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h4 className="font-medium mb-2">Aucune combinaison disponible</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Pas de matchs ce soir ou données insuffisantes pour générer des suggestions.
          </p>
          <Button variant="outline" onClick={fetchAISuggestions}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Réessayer
          </Button>
        </div>
      )}
    </Card>
  );
}
