
# Plan : Combinaisons JOUEURS Automatiques avec Apprentissage IA

## Objectif

Transformer le `SystemBetBuilder` pour que l'IA propose **3 combinaisons joueurs automatiques** (buteurs/points) avec un système de récupération de mise intégré, tout en apprenant de ses erreurs.

## Nouvelle Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                    SUPER COMBO IA - JOUEURS                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🛡️ COMBO SAFE                    │  🎲 COMBO FUN                          │
│  Système 2/3 ou 2/4               │  Système 2/4 ou 3/4                    │
│  Cotes 2.00-3.00 par joueur       │  Cotes 2.50-4.00 par joueur            │
│  Récupère ~80% mise si 2 OK       │  Équilibre risque/gain                 │
│                                   │                                         │
├───────────────────────────────────┴─────────────────────────────────────────┤
│                                                                             │
│  🎰 SUPER COMBO                                                             │
│  Système 3/5 ou 4/5                                                         │
│  Cotes 3.00-5.00+ par joueur                                                │
│  Gros gains potentiels                                                      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  📊 Apprentissage IA                                                        │
│  - Historique des combos placés vs résultats                                │
│  - Ajustement automatique des joueurs favorisés                             │
│  - Amélioration des suggestions au fil du temps                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Modifications Techniques

### 1. Mise à Jour Edge Function `suggest-combo/index.ts`

Changer le prompt IA pour proposer 3 combinaisons **100% joueurs** :

```typescript
const comboPrompt = `Tu es un expert en paris sportifs NHL. 
Analyse les matchs de ce soir et propose 3 combinaisons JOUEURS optimales.

## RÈGLES IMPORTANTES:
1. UNIQUEMENT des buteurs ou pointeurs (pas d'équipes)
2. Chaque combo = sélections JOUEURS uniquement

## 3 COMBINAISONS À PROPOSER:

### COMBO SAFE (récupération de mise)
- Système 2/3 ou 2/4
- 3-4 joueurs avec cotes 2.00-3.00
- Objectif: Si 2 sélections passent, on récupère ~80% de la mise
- Privilégier joueurs réguliers, adversaires fatigués (B2B)

### COMBO FUN (équilibre)
- Système 2/4 ou 3/4
- 3-4 joueurs avec cotes 2.50-4.00
- Bon ratio risque/gain

### SUPER COMBO (gros gains)
- Système 3/5 ou 4/5
- 4-5 joueurs avec cotes 3.50-6.00
- Joueurs en feu avec opportunités PP

## CALCUL RÉCUPÉRATION MISE (SAFE):
Pour un système 2/3 avec mise 1€/combo (3 combos = 3€):
- Si 3/3 passent: Gain = (cote1*cote2 + cote1*cote3 + cote2*cote3) * 1€
- Si 2/3 passent: Gain = coteA*coteB * 1€ 
- Objectif SAFE: 2 sélections gagnantes = ~2.40€ (récup 80% de 3€)

## INTÉGRATION APPRENTISSAGE:
${learningContext} // Historique des joueurs et leurs performances

Réponds en JSON avec minRecoveryPercent pour le SAFE
`;
```

### 2. Nouveau Schéma de Réponse IA

```typescript
interface AIPlayerCombo {
  name: string;  // "Combo SAFE Joueurs 2/3"
  type: 'SAFE' | 'FUN' | 'SUPER_COMBO';
  systemType: string;  // "2/3"
  stakePerCombo: number;  // 0.50€
  totalStake: number;  // 1.50€ (3 combos)
  
  selections: {
    name: string;  // "Connor McDavid"
    team: string;  // "EDM"
    match: string;  // "EDM vs CGY"
    betType: 'Buteur' | 'Point' | 'But+Passe';
    estimatedOdds: number;
    reason: string;
    learningScore: number;  // Ajustement IA basé sur l'historique
  }[];
  
  // Calculs automatiques
  combinationsCount: number;
  potentialGains: {
    min: number;  // Si minimum de sélections gagnantes
    max: number;  // Si toutes gagnantes
  };
  
  // Spécifique SAFE
  minRecoveryPercent?: number;  // "Si 2/3 OK, récupère X% de la mise"
  
  confidence: number;
  reasoning: string;
}
```

### 3. Intégration Apprentissage dans le Prompt

Récupérer les métriques avant d'appeler l'IA :

```typescript
// Dans suggest-combo/index.ts
const { data: learningMetrics } = await supabase
  .from('learning_metrics')
  .select('*')
  .eq('metric_type', 'player')
  .order('wins', { ascending: false });

const learningContext = (learningMetrics || [])
  .filter(m => m.total >= 3)
  .map(m => `${m.metric_key}: ${Math.round(m.wins/m.total*100)}% win (${m.total} paris), ajustement ${m.confidence_adjustment > 0 ? '+' : ''}${m.confidence_adjustment}%`)
  .join('\n');

// Ajouter au prompt:
// "## HISTORIQUE APPRENTISSAGE (favoriser les joueurs avec bon score):
// ${learningContext}"
```

### 4. Mise à Jour `SystemBetBuilder.tsx`

- Affichage des 3 combos joueurs en cartes cliquables
- Calcul automatique de la récupération de mise pour le SAFE
- Bouton "Placer ce combo" pour chaque suggestion
- Plus besoin de saisie manuelle

```typescript
// Affichage du % de récupération pour SAFE
{combo.type === 'SAFE' && combo.minRecoveryPercent && (
  <div className="p-2 rounded bg-success/10 border border-success/20">
    <p className="text-xs text-success">
      🛡️ Si {combo.systemType.split('/')[0]} sélections passent: 
      récupération {combo.minRecoveryPercent}% de la mise
    </p>
  </div>
)}
```

### 5. Enrichissement Table `learning_metrics`

Ajouter le tracking des combos IA :

```sql
-- Ajouter une colonne pour tracker la source
ALTER TABLE learning_metrics 
ADD COLUMN IF NOT EXISTS combo_type TEXT;

-- Tracker les combos SAFE, FUN, SUPER_COMBO séparément
-- metric_type = 'combo', metric_key = 'SAFE' / 'FUN' / 'SUPER_COMBO'
```

### 6. Mise à Jour `learn-from-results/index.ts`

Tracker les performances des combos IA :

```typescript
// Détecter les paris système
if (bet.bet_type?.startsWith('SYSTEM_')) {
  const comboType = bet.notes?.includes('[SAFE]') ? 'SAFE' 
    : bet.notes?.includes('[FUN]') ? 'FUN'
    : 'SUPER_COMBO';
  
  updateMetric('combo', comboType, isWin, roiPercent);
}

// Extraire les joueurs du notes
const playerMatches = bet.notes?.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g);
playerMatches?.forEach(player => {
  updateMetric('player', player.toLowerCase(), isWin, roiPercent);
});
```

## Fichiers à Modifier

| Fichier | Action | Description |
|---------|--------|-------------|
| `supabase/functions/suggest-combo/index.ts` | Modifier | Prompt 100% joueurs, intégration learning, calcul récupération |
| `src/components/dashboard/SystemBetBuilder.tsx` | Modifier | Affichage 3 combos joueurs, % récupération, sans saisie manuelle |
| `supabase/functions/learn-from-results/index.ts` | Modifier | Tracker joueurs individuels et types de combos |

## Flux Utilisateur Final

1. L'utilisateur ouvre le Super Combo IA
2. L'IA analyse les joueurs en forme + historique d'apprentissage
3. 3 cartes s'affichent : SAFE, FUN, SUPER COMBO (joueurs uniquement)
4. Chaque carte montre :
   - Les joueurs sélectionnés avec cotes estimées
   - Le type de système (2/3, 3/4, etc.)
   - Le % de récupération (pour SAFE)
   - Le gain potentiel min/max
5. L'utilisateur clique sur "Placer" sur le combo choisi
6. Après validation des résultats, l'IA apprend et améliore ses futures suggestions
