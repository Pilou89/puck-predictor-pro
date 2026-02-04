import React, { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Layers,
  Plus,
  X,
  Calculator,
  DollarSign,
  TrendingUp,
  Check,
  Loader2,
  Sparkles,
  Target,
  Users,
  Info,
  Brain,
  RefreshCw,
  Zap,
  Shield
} from "lucide-react";
import { toast } from "sonner";
import { useBankroll } from "@/hooks/useBankroll";
import { supabase } from "@/integrations/supabase/client";

interface SystemSelection {
  id: string;
  name: string;
  match: string;
  odds: number;
  type: 'team' | 'player';
  betType?: string;
  reason?: string;
  status?: 'won' | 'lost' | 'pending';
}

interface SystemType {
  name: string;
  required: number;
  total: number;
  combinations: number;
}

interface AIComboSuggestion {
  name: string;
  type: 'SAFE' | 'FUN' | 'SUPER_COMBO';
  systemType: string;
  selections: {
    name: string;
    type: 'team' | 'player';
    betType: string;
    match: string;
    estimatedOdds: number;
    reason: string;
  }[];
  combinedOdds: number;
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

// Generate all possible combinations
function generateCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  
  const [first, ...rest] = arr;
  const withFirst = generateCombinations(rest, k - 1).map(comb => [first, ...comb]);
  const withoutFirst = generateCombinations(rest, k);
  
  return [...withFirst, ...withoutFirst];
}

// Get available system types for a given number of selections
function getAvailableSystemTypes(selectionsCount: number): SystemType[] {
  const systems: SystemType[] = [];
  
  for (let required = 2; required <= selectionsCount; required++) {
    const numCombos = combinations(selectionsCount, required);
    systems.push({
      name: required === selectionsCount 
        ? `Combiné ${selectionsCount} pronostics` 
        : `Système ${required}/${selectionsCount}`,
      required,
      total: selectionsCount,
      combinations: numCombos,
    });
  }
  
  return systems;
}

export function SystemBetBuilder({ onClose }: SystemBetBuilderProps) {
  const { addBet, isUpdating } = useBankroll();
  const [selections, setSelections] = useState<SystemSelection[]>([]);
  const [selectedSystemIndex, setSelectedSystemIndex] = useState<number>(0);
  const [stakePerCombo, setStakePerCombo] = useState<string>("0.25");
  const [isPlacing, setIsPlacing] = useState(false);
  
  // AI Suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<AIComboSuggestion[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
  const [newSelection, setNewSelection] = useState({
    name: "",
    match: "",
    odds: "",
    type: "player" as 'team' | 'player'
  });

  const availableSystems = useMemo(() => 
    getAvailableSystemTypes(selections.length),
    [selections.length]
  );

  const selectedSystem = availableSystems[selectedSystemIndex] || null;

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
        setAiSuggestions(data.combos);
        setAiAnalysis(data.analysis || '');
        toast.success(`${data.combos.length} combinaisons IA générées ! 🎰`);
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

  // Load AI suggestion into selections
  const loadAISuggestion = (combo: AIComboSuggestion) => {
    const newSelections: SystemSelection[] = combo.selections.map((sel, i) => ({
      id: `ai-${Date.now()}-${i}`,
      name: sel.name,
      match: sel.match,
      odds: sel.estimatedOdds,
      type: sel.type,
      betType: sel.betType,
      reason: sel.reason,
      status: 'pending',
    }));

    setSelections(newSelections);
    
    // Auto-select appropriate system type
    const systemParts = combo.systemType.split('/');
    if (systemParts.length === 2) {
      const required = parseInt(systemParts[0]);
      const total = parseInt(systemParts[1]);
      if (total === newSelections.length) {
        const idx = availableSystems.findIndex(s => s.required === required && s.total === total);
        if (idx >= 0) setSelectedSystemIndex(idx);
      }
    }

    toast.success(`Combinaison "${combo.name}" chargée !`);
  };

  // Calculate stakes and potential gains
  const calculation = useMemo(() => {
    if (!selectedSystem || selections.length < 2) return null;

    const stake = parseFloat(stakePerCombo) || 0;
    const totalStake = stake * selectedSystem.combinations;
    
    const allCombos = generateCombinations(selections, selectedSystem.required);
    
    const comboOdds = allCombos.map(combo => 
      combo.reduce((acc, sel) => acc * sel.odds, 1)
    );
    
    const maxGain = comboOdds.reduce((sum, odds) => sum + (stake * odds), 0);
    const minComboOdds = Math.min(...comboOdds);
    const minGain = stake * minComboOdds;

    const combosDisplay = allCombos.map((combo, i) => ({
      selections: combo.map(s => s.name),
      combinedOdds: comboOdds[i],
      potentialGain: stake * comboOdds[i],
    }));

    return {
      totalStake,
      maxGain,
      minGain,
      combosCount: selectedSystem.combinations,
      combosDisplay,
    };
  }, [selections, selectedSystem, stakePerCombo]);

  const addSelection = () => {
    const odds = parseFloat(newSelection.odds);
    if (!newSelection.name || !newSelection.match || isNaN(odds) || odds <= 1) {
      toast.error("Veuillez remplir tous les champs correctement");
      return;
    }

    const newSel: SystemSelection = {
      id: `sel-${Date.now()}`,
      name: newSelection.name,
      match: newSelection.match,
      odds,
      type: newSelection.type,
      status: 'pending',
    };

    setSelections(prev => [...prev, newSel]);
    setNewSelection({ name: "", match: "", odds: "", type: "player" });
    toast.success(`${newSel.name} ajouté au système`);
  };

  const removeSelection = (id: string) => {
    setSelections(prev => prev.filter(s => s.id !== id));
    if (selections.length - 1 < 2) {
      setSelectedSystemIndex(0);
    }
  };

  const handlePlaceSystemBet = async () => {
    if (!selectedSystem || !calculation) return;

    setIsPlacing(true);
    const today = new Date().toISOString().split('T')[0];

    try {
      const selectionsStr = selections.map(s => s.name).join(' + ');
      const systemDetails = `[SYSTÈME ${selectedSystem.required}/${selectedSystem.total}] ${selectionsStr}`;
      
      addBet({
        bet_date: today,
        match_name: selections.map(s => s.match).join(' | '),
        bet_type: `SYSTEM_${selectedSystem.required}_${selectedSystem.total}`,
        selection: selectionsStr,
        odds: selections.reduce((acc, s) => acc * s.odds, 1),
        stake: calculation.totalStake,
        potential_gain: calculation.maxGain,
        outcome: 'pending',
        actual_gain: 0,
        source: 'manual',
        notes: `${systemDetails}\n${selectedSystem.combinations} combinaisons @ ${stakePerCombo}€/combo\nCotes: ${selections.map(s => `${s.name} @${s.odds}`).join(' • ')}`,
      });

      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Système {selectedSystem.required}/{selectedSystem.total} placé ! 🎰</span>
          <span className="text-sm opacity-80">{selectionsStr}</span>
        </div>
      );

      setSelections([]);
      setSelectedSystemIndex(0);
      setStakePerCombo("0.25");
      
      if (onClose) onClose();
    } catch (err) {
      console.error('Error placing system bet:', err);
      toast.error('Erreur lors du placement du système');
    } finally {
      setIsPlacing(false);
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'SAFE': return 'bg-success/20 text-success border-success/30';
      case 'FUN': return 'bg-warning/20 text-warning border-warning/30';
      case 'SUPER_COMBO': return 'bg-accent/20 text-accent border-accent/30';
      default: return 'bg-muted text-muted-foreground';
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
              Super Combo IA
              <Badge className="bg-accent/20 text-accent border-accent/30 border text-xs">
                Suggestions Auto
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              L'IA analyse les matchs et propose des combinaisons optimales
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
      {aiAnalysis && (
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
            <span className="text-sm">L'IA analyse les matchs de ce soir...</span>
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
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

      {/* AI Suggestions */}
      {!isLoadingAI && aiSuggestions.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Combinaisons suggérées par l'IA
          </h4>
          <div className="grid gap-4 md:grid-cols-3">
            {aiSuggestions.map((combo, index) => {
              const TypeIcon = getTypeIcon(combo.type);
              return (
                <div 
                  key={index}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:ring-2 hover:ring-primary/20 ${getTypeColor(combo.type)}`}
                  onClick={() => loadAISuggestion(combo)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TypeIcon className="w-5 h-5" />
                      <span className="font-semibold text-sm">{combo.name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono">
                      {combo.systemType}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-3">
                    {combo.selections.map((sel, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="truncate flex-1">{sel.name}</span>
                        <Badge variant="secondary" className="font-mono ml-2">
                          @{sel.estimatedOdds.toFixed(2)}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-current/20">
                    <div>
                      <p className="text-xs opacity-70">Cote combinée</p>
                      <p className="font-mono font-bold">@{combo.combinedOdds.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-70">Confiance</p>
                      <p className="font-bold">{combo.confidence}%</p>
                    </div>
                  </div>

                  <p className="text-xs opacity-70 mt-2 italic line-clamp-2">
                    {combo.reasoning}
                  </p>

                  <Button 
                    size="sm" 
                    variant="secondary" 
                    className="w-full mt-3 gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadAISuggestion(combo);
                    }}
                  >
                    <Check className="w-4 h-4" />
                    Utiliser cette combinaison
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual Add Selection (collapsed by default when AI suggestions exist) */}
      {(aiSuggestions.length === 0 || selections.length > 0) && (
        <details className={`mb-6 ${aiSuggestions.length > 0 ? '' : 'open'}`} open={aiSuggestions.length === 0}>
          <summary className="cursor-pointer text-sm font-medium mb-3 flex items-center gap-2 hover:text-primary transition-colors">
            <Plus className="w-4 h-4" />
            Ajouter manuellement une sélection
          </summary>
          <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Joueur / Équipe</label>
                <Input
                  placeholder="Ex: Nikita Kucherov"
                  value={newSelection.name}
                  onChange={(e) => setNewSelection(prev => ({ ...prev, name: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Match</label>
                <Input
                  placeholder="Ex: TBL vs BOS"
                  value={newSelection.match}
                  onChange={(e) => setNewSelection(prev => ({ ...prev, match: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cote</label>
                <Input
                  type="number"
                  step="0.01"
                  min="1.01"
                  placeholder="3.50"
                  value={newSelection.odds}
                  onChange={(e) => setNewSelection(prev => ({ ...prev, odds: e.target.value }))}
                  className="h-9 font-mono"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addSelection} size="sm" className="w-full h-9 gap-2">
                  <Plus className="w-4 h-4" />
                  Ajouter
                </Button>
              </div>
            </div>
          </div>
        </details>
      )}

      {/* Current selections */}
      {selections.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Mes sélections ({selections.length})
          </h4>
          <div className="space-y-2">
            {selections.map((sel, i) => (
              <div 
                key={sel.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{sel.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sel.match}
                      {sel.reason && <span className="ml-2 italic">— {sel.reason}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono">
                    @{sel.odds.toFixed(2)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSelection(sel.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System type selector */}
      {selections.length >= 2 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Type de système
          </h4>
          <div className="flex flex-wrap gap-2">
            {availableSystems.map((sys, index) => (
              <Button
                key={sys.name}
                variant={selectedSystemIndex === index ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedSystemIndex(index)}
                className="gap-2"
              >
                {sys.name}
                <Badge 
                  variant="secondary" 
                  className={`text-xs ${selectedSystemIndex === index ? 'bg-primary-foreground/20' : ''}`}
                >
                  {sys.combinations} combis
                </Badge>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Stake input */}
      {selectedSystem && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Mise par combinaison
          </h4>
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-xs">
              <Input
                type="number"
                step="0.25"
                min="0.10"
                placeholder="0.25"
                value={stakePerCombo}
                onChange={(e) => setStakePerCombo(e.target.value)}
                className="h-10 font-mono text-lg"
              />
            </div>
            <div className="flex gap-2">
              {[0.25, 0.50, 1.00].map(val => (
                <Button
                  key={val}
                  variant={stakePerCombo === val.toFixed(2) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStakePerCombo(val.toFixed(2))}
                >
                  {val.toFixed(2)}€
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calculation summary */}
      {calculation && (
        <div className="p-4 rounded-lg bg-gradient-to-br from-success/10 to-primary/10 border border-success/30 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-success" />
            <span className="font-semibold">Récapitulatif</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">Combinaisons</p>
              <p className="font-mono font-bold text-lg">{calculation.combosCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Mise totale</p>
              <p className="font-mono font-bold text-lg">{calculation.totalStake.toFixed(2)}€</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gain min ({selectedSystem?.required} gagnants)</p>
              <p className="font-mono font-bold text-lg text-warning">{calculation.minGain.toFixed(2)}€</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gain max (tout gagné)</p>
              <p className="font-mono font-bold text-lg text-success">{calculation.maxGain.toFixed(2)}€</p>
            </div>
          </div>

          <details className="cursor-pointer">
            <summary className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Voir les {calculation.combosCount} combinaisons
            </summary>
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {calculation.combosDisplay.map((combo, i) => (
                <div 
                  key={i} 
                  className="flex items-center justify-between p-2 rounded bg-secondary/30 text-sm"
                >
                  <span className="text-muted-foreground">
                    {combo.selections.join(' + ')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">@{combo.combinedOdds.toFixed(2)}</span>
                    <span className="font-mono text-success">→ {combo.potentialGain.toFixed(2)}€</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Info box when no selections */}
      {selections.length < 2 && !isLoadingAI && aiSuggestions.length === 0 && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border/50 mb-6 flex items-start gap-3">
          <Info className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm text-muted-foreground">
              L'IA va analyser les matchs de ce soir et proposer des combinaisons optimales.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Vous pouvez aussi ajouter manuellement vos propres sélections.
            </p>
          </div>
        </div>
      )}

      {/* Place bet button */}
      {calculation && (
        <Button
          onClick={handlePlaceSystemBet}
          disabled={isPlacing || isUpdating}
          size="lg"
          className="w-full gap-2"
        >
          {isPlacing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Placement...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Placer le Système {selectedSystem?.name} ({calculation.totalStake.toFixed(2)}€)
            </>
          )}
        </Button>
      )}
    </Card>
  );
}
