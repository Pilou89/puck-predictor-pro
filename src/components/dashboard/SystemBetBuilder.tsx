import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  Info
} from "lucide-react";
import { toast } from "sonner";
import { useBankroll } from "@/hooks/useBankroll";

interface SystemSelection {
  id: string;
  name: string;
  match: string;
  odds: number;
  type: 'team' | 'player';
  status?: 'won' | 'lost' | 'pending';
}

interface SystemType {
  name: string;
  required: number;
  total: number;
  combinations: number;
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
  
  // System X/Y means X selections must win out of Y total
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

  // Calculate stakes and potential gains
  const calculation = useMemo(() => {
    if (!selectedSystem || selections.length < 2) return null;

    const stake = parseFloat(stakePerCombo) || 0;
    const totalStake = stake * selectedSystem.combinations;
    
    // Calculate potential gain for full win (all selections win)
    const allCombos = generateCombinations(selections, selectedSystem.required);
    
    // For each combo, calculate the combined odds
    const comboOdds = allCombos.map(combo => 
      combo.reduce((acc, sel) => acc * sel.odds, 1)
    );
    
    // If all selections win, all combos win
    const maxGain = comboOdds.reduce((sum, odds) => sum + (stake * odds), 0);
    
    // Minimum gain scenario: exactly 'required' selections win
    // Only 1 combo wins in this case
    const minComboOdds = Math.min(...comboOdds);
    const minGain = stake * minComboOdds;

    // Calculate each combo for display
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
    // Reset system selection if needed
    if (selections.length - 1 < 2) {
      setSelectedSystemIndex(0);
    }
  };

  const handlePlaceSystemBet = async () => {
    if (!selectedSystem || !calculation) return;

    setIsPlacing(true);
    const today = new Date().toISOString().split('T')[0];

    try {
      // Place the system bet as a single entry with details in notes
      const selectionsStr = selections.map(s => s.name).join(' + ');
      const systemDetails = `[SYSTÈME ${selectedSystem.required}/${selectedSystem.total}] ${selectionsStr}`;
      
      addBet({
        bet_date: today,
        match_name: selections.map(s => s.match).join(' | '),
        bet_type: `SYSTEM_${selectedSystem.required}_${selectedSystem.total}`,
        selection: selectionsStr,
        odds: selections.reduce((acc, s) => acc * s.odds, 1), // Combined odds
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

      // Reset form
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

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-accent/20 to-primary/20">
            <Layers className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              Constructeur de Système
              <Badge className="bg-accent/20 text-accent border-accent/30 border text-xs">
                Winamax Style
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Combine plusieurs sélections • Réduit le risque
            </p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Add new selection form */}
      <div className="p-4 rounded-lg bg-secondary/30 border border-border/50 mb-6">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Ajouter une sélection
        </h4>
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
                    <p className="text-xs text-muted-foreground">{sel.match}</p>
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

          {/* Show combinations breakdown */}
          <div className="border-t border-border/50 pt-3">
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
        </div>
      )}

      {/* Info box */}
      {selections.length < 2 && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border/50 mb-6 flex items-start gap-3">
          <Info className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm text-muted-foreground">
              Ajoutez au moins <strong>2 sélections</strong> pour créer un système.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Un Système 2/3 signifie que 2 sélections sur 3 doivent gagner pour remporter au moins une combinaison.
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
