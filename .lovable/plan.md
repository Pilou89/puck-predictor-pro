
# Plan : Restructurer les Piliers avec Paris Parallèles et Apprentissage IA

## Objectif

Transformer la structure actuelle pour avoir deux piliers indépendants avec les mêmes trois types de paris chacun, et implémenter un système d'apprentissage qui ajuste les prévisions en fonction des résultats historiques.

## Nouvelle Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                           DASHBOARD RESTRUCTURÉ                             │
├────────────────────────────────┬───────────────────────────────────────────┤
│      PILIER ÉQUIPE (Auto)      │       PILIER JOUEURS (IA + Manuel)        │
├────────────────────────────────┼───────────────────────────────────────────┤
│  🛡️ SAFE (1.40-1.80)           │  🛡️ SAFE (confiance > 85%)                │
│  🎲 FUN (3.00-4.50)            │  🎲 FUN (cote > 4.00)                      │
│  🎰 SUPER COMBO (≥ 4.50)       │  🎰 SUPER COMBO (combiné buteurs)          │
├────────────────────────────────┴───────────────────────────────────────────┤
│                     PANIER STRATÉGIQUE DU SOIR                              │
│  Combine les meilleures sélections des deux piliers + BLOC DUO             │
├────────────────────────────────────────────────────────────────────────────┤
│                       MODULE D'APPRENTISSAGE IA                             │
│  Ajuste les coefficients de confiance selon les résultats passés           │
└────────────────────────────────────────────────────────────────────────────┘
```

## Fichiers à Créer/Modifier

| Fichier | Action | Description |
|---------|--------|-------------|
| `TeamPillarPanel.tsx` | Modifier | Ajouter SAFE, FUN, SUPER COMBO pour équipes |
| `PlayerPillarPanel.tsx` | Modifier | Ajouter SAFE, FUN, SUPER COMBO pour joueurs |
| `StrategicBasketPanel.tsx` | Modifier | Combiner les 6 blocs + DUO séparé |
| `LearningPanel.tsx` | Modifier | Afficher les métriques d'apprentissage |
| `betting-strategy/index.ts` | Modifier | Intégrer l'apprentissage des résultats |
| `validate-predictions/index.ts` | Modifier | Enrichir avec métriques de feedback |
| `learn-from-results/index.ts` | Créer | Calculer les ajustements de confiance |

## Détails Techniques

### 1. Pilier ÉQUIPE (100% Automatique)

Trois blocs distincts basés sur les cotes H2H Winamax FR :

```typescript
// TeamPillarPanel.tsx - Nouvelle structure
interface TeamPillarData {
  safeBets: TeamBet[];       // Cote 1.40 - 1.80
  funBets: TeamBet[];        // Cote 3.00 - 4.50 (risque modéré)
  superComboBets: TeamBet[]; // Cote >= 4.50 (outsiders)
  learningBoosts: Map<string, number>; // Ajustements IA
}

// Catégorisation des cotes
const categorizeBets = (h2hOdds: Odd[], learningBoosts: Map<string, number>) => {
  return {
    safe: h2hOdds.filter(o => o.price >= 1.40 && o.price <= 1.80),
    fun: h2hOdds.filter(o => o.price > 1.80 && o.price < 4.50),
    superCombo: h2hOdds.filter(o => o.price >= 4.50),
  };
};
```

### 2. Pilier JOUEURS (IA + Saisie Manuelle)

Structure parallèle avec trois blocs :

```typescript
// PlayerPillarPanel.tsx - Nouvelle structure
interface PlayerPillarData {
  safePlayers: PlayerAnalysis[];      // Confiance > 85%
  funPlayers: PlayerAnalysis[];       // Cote manuelle 3.00-4.50
  superComboPlayers: PlayerAnalysis[]; // Pour combiné multi-buteurs
}

// Interface de saisie manuelle pour chaque catégorie
const renderPlayerCategory = (
  players: PlayerAnalysis[],
  category: 'SAFE' | 'FUN' | 'SUPER_COMBO',
  onOddsInput: (playerId: string, odds: number) => void
) => {
  // Affiche les joueurs avec champ de saisie cote Winamax
};
```

### 3. Super Combo FUN (Nouveau Bloc)

Le Super Combo combine plusieurs éléments à haute cote :

```typescript
// Types de Super Combo possibles
type SuperComboType = 
  | 'MULTI_TEAM'      // 2+ équipes outsiders
  | 'MULTI_SCORER'    // 2+ buteurs à grosse cote
  | 'TEAM_PLUS_SCORER'; // 1 équipe outsider + 1 buteur

interface SuperComboBet {
  id: string;
  type: SuperComboType;
  selections: Array<{
    name: string;
    odds: number;
    source: 'team' | 'player';
  }>;
  combinedOdds: number;  // Multiplication des cotes
  stake: number;         // Mise fixe 0.50€
  potentialGain: number;
}

// Calcul de la cote combinée
const calculateCombinedOdds = (selections: Selection[]): number => {
  return selections.reduce((acc, s) => acc * s.odds, 1);
};
```

### 4. Système d'Apprentissage IA

Nouvelle Edge Function pour analyser les résultats et ajuster les prévisions :

```typescript
// supabase/functions/learn-from-results/index.ts

interface LearningMetrics {
  // Par type de marché
  marketPerformance: Map<string, { wins: number; total: number; roi: number }>;
  
  // Par équipe
  teamPerformance: Map<string, { wins: number; total: number; accuracy: number }>;
  
  // Par joueur
  playerPerformance: Map<string, { goals: number; predictions: number; hitRate: number }>;
  
  // Facteurs contextuels
  b2bImpact: { withB2B: number; withoutB2B: number };
  pimImpact: { highPIM: number; lowPIM: number };
}

// Calcul des ajustements de confiance
const calculateConfidenceBoosts = (metrics: LearningMetrics): ConfidenceBoosts => {
  return {
    // Si les paris B2B ont +15% de succès, augmenter le boost B2B
    b2bBoost: metrics.b2bImpact.withB2B > 0.65 ? 20 : 15,
    
    // Ajuster par équipe selon performance historique
    teamBoosts: calculateTeamBoosts(metrics.teamPerformance),
    
    // Ajuster par joueur selon taux de réussite
    playerBoosts: calculatePlayerBoosts(metrics.playerPerformance),
  };
};
```

### 5. Intégration du Learning dans betting-strategy

Modifier l'Edge Function pour utiliser les métriques d'apprentissage :

```typescript
// betting-strategy/index.ts - Ajout

// Récupérer les métriques d'apprentissage
const { data: learningData } = await supabase
  .from('prediction_history')
  .select('*')
  .eq('outcome_win', true)
  .gte('prediction_date', thirtyDaysAgo);

// Calculer les ajustements
const winRateByMarket = calculateWinRateByMarket(learningData);
const winRateByTeam = calculateWinRateByTeam(learningData);

// Appliquer les ajustements au score de confiance
const adjustedConfidence = (baseConfidence: number, context: BetContext): number => {
  let adjusted = baseConfidence;
  
  // Bonus/malus selon performance historique du marché
  if (winRateByMarket[context.marketType] > 0.6) {
    adjusted += 5;
  } else if (winRateByMarket[context.marketType] < 0.4) {
    adjusted -= 10;
  }
  
  // Bonus/malus selon performance historique de l'équipe
  if (winRateByTeam[context.team] > 0.7) {
    adjusted += 10;
  }
  
  return Math.min(95, Math.max(30, adjusted));
};
```

### 6. Nouveau LearningPanel Amélioré

Afficher les métriques d'apprentissage :

```typescript
// LearningPanel.tsx - Nouvelle version

interface LearningPanelProps {
  stats: PredictionStats;
  learningMetrics: {
    byMarket: { type: string; winRate: number; count: number }[];
    byTeam: { team: string; winRate: number; count: number }[];
    trends: { period: string; roi: number }[];
  };
}

// Sections à afficher
// 1. Performance globale (Win Rate, ROI)
// 2. Performance par type de marché (H2H, Buteur, Points)
// 3. Performance par équipe (Top 5 / Bottom 5)
// 4. Tendances récentes (7j, 14j, 30j)
// 5. Indicateur de confiance IA (s'améliore-t-elle ?)
```

### 7. Nouvelle Table pour l'Apprentissage

Migration pour stocker les métriques d'apprentissage :

```sql
-- Nouvelle table pour les métriques d'apprentissage
CREATE TABLE learning_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL, -- 'market', 'team', 'player', 'context'
  metric_key TEXT NOT NULL,  -- 'h2h', 'TOR', 'McDavid', 'b2b_opponent'
  wins INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  roi DECIMAL(6,2) DEFAULT 0,
  confidence_adjustment INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(metric_type, metric_key)
);

-- Index pour performance
CREATE INDEX idx_learning_metrics_type ON learning_metrics(metric_type);
```

## Flux de Données

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 1. COLLECTE (sync-nhl-stats, sync-winamax-odds)                     │
│    └─> player_stats, winamax_odds, team_meta                        │
├─────────────────────────────────────────────────────────────────────┤
│ 2. ANALYSE (betting-strategy)                                        │
│    └─> Génère les paris avec learning_metrics comme contexte        │
├─────────────────────────────────────────────────────────────────────┤
│ 3. SÉLECTION (Frontend Piliers)                                      │
│    └─> Utilisateur sélectionne paris + saisit cotes manuelles       │
├─────────────────────────────────────────────────────────────────────┤
│ 4. PLACEMENT (user_bets)                                             │
│    └─> Paris placés avec source='ai_suggestion'                     │
├─────────────────────────────────────────────────────────────────────┤
│ 5. VALIDATION (validate-predictions)                                 │
│    └─> Marque outcome='won'/'lost' selon résultats réels            │
├─────────────────────────────────────────────────────────────────────┤
│ 6. APPRENTISSAGE (learn-from-results)                                │
│    └─> Calcule les ajustements et met à jour learning_metrics       │
└─────────────────────────────────────────────────────────────────────┘
```

## Résumé des Modifications

1. **Pilier ÉQUIPE** : 3 blocs (SAFE, FUN, SUPER COMBO) au lieu de 2
2. **Pilier JOUEURS** : 3 blocs parallèles avec saisie manuelle des cotes
3. **SUPER COMBO** : Nouveau type de pari combinant plusieurs sélections
4. **Panier Stratégique** : Combine les meilleures options des deux piliers + DUO
5. **Apprentissage IA** : Ajuste les confiances selon les résultats historiques
6. **Learning Panel** : Affiche les métriques d'apprentissage détaillées

