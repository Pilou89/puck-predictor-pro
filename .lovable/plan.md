
# Plan : Afficher les Vraies Données (0 paris = 0 résultats)

## Objectif
Supprimer tous les mock data du module "Learning & Performance" pour afficher uniquement les vraies statistiques basées sur les données de la base de données.

---

## Modifications à Effectuer

### 1. Mise à jour de `src/pages/Index.tsx`

**Problème actuel :**
```tsx
const displayStats = stats.totalPredictions > 0 ? predictionStats : mockPredictionStats;
```
Quand `totalPredictions = 0`, le système utilise `mockPredictionStats` avec 67% de win rate.

**Solution :**
Toujours utiliser les vraies statistiques (qui seront à 0 quand il n'y a pas de données) :
```tsx
const displayStats = predictionStats; // Toujours les vraies stats
```

---

### 2. Mise à jour de `src/components/dashboard/LearningPanel.tsx`

**Problèmes actuels :**
- Lignes 65-76 : Performance Récente avec données mock `[true, true, false, ...]`
- Lignes 84-88 : Précision par Marché avec valeurs codées en dur (68%, 72%, 55%)

**Solutions :**

**a) Performance Récente** - Afficher un message "Aucun pari" quand vide, sinon les vrais résultats :
```tsx
{stats.totalPredictions === 0 ? (
  <p className="text-sm text-muted-foreground italic">
    Aucun pari enregistré pour le moment
  </p>
) : (
  // Afficher les vrais résultats récents (à connecter plus tard)
)}
```

**b) Précision par Marché** - Afficher 0% ou un état vide :
```tsx
{stats.totalPredictions === 0 ? (
  <p className="text-sm text-muted-foreground italic">
    Données disponibles après les premiers paris
  </p>
) : (
  // Calculer les vraies précisions par type de marché
)}
```

---

## Résultat Attendu

Après ces modifications, le module "Learning & Performance" affichera :
- **Taux de Réussite** : 0%
- **ROI Global** : +0.0%
- **Performance Récente** : "Aucun pari enregistré pour le moment"
- **Précision par Marché** : "Données disponibles après les premiers paris"
- Texte : "0 victoires sur 0 prédictions"

---

## Fichiers Modifiés

| Fichier | Modification |
|---------|--------------|
| `src/pages/Index.tsx` | Supprimer le fallback vers mockPredictionStats |
| `src/components/dashboard/LearningPanel.tsx` | Remplacer les données mock par un état conditionnel vide |

---

## Détails Techniques

Le hook `useNHLData.ts` retourne déjà les bonnes valeurs par défaut quand la base est vide (lignes 159-165) :
```tsx
stats: gamesQuery.data?.stats || {
  totalPredictions: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  roi: 0,
}
```

Le problème vient uniquement du fallback dans `Index.tsx` et des valeurs codées en dur dans `LearningPanel.tsx`.
