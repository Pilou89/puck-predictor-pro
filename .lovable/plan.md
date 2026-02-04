

# Plan : Empêcher l'IA de proposer des duos sans données valides

## Problème Identifié

L'IA propose le duo "MacKinnon + Rantanen" alors que :
1. **Les tables sont vides** : `player_stats` = 0 entrées, `winamax_odds` = 0 entrées
2. **Rantanen a été transféré à Dallas** et ne joue plus avec MacKinnon (Colorado)
3. **L'IA invente** des duos basés sur ses connaissances générales car elle n'a aucune donnée réelle

Le filtre d'activité fonctionne correctement (logs : `0 buteurs actifs, 0 duos actifs`), mais l'IA génère quand même des suggestions car le prompt ne lui interdit pas explicitement de le faire.

---

## Solution en 2 parties

### 1. Bloquer la génération si données insuffisantes

Avant d'appeler l'IA, vérifier qu'il y a des données exploitables. Si les listes sont vides, retourner un panier vide avec un message explicatif au lieu de laisser l'IA inventer.

```typescript
// Après la construction de topGoalScorers, topH2H, topDuos
if (topGoalScorers.length === 0 && topH2H.length === 0) {
  return new Response(
    JSON.stringify({ 
      success: true, 
      basket: {
        timestamp: now.toISOString(),
        totalStake: 0,
        totalPotentialGain: 0,
        isCovered: false,
        coverageDetails: "Aucune donnée disponible",
        safe: null,
        duo: null,
        fun: null,
        summary: "⚠️ Données insuffisantes. Synchronisez les cotes et statistiques avant de générer un panier."
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  );
}
```

### 2. Ajouter une vérification d'équipe pour les duos

Même quand les données existeront, ajouter une vérification que les deux joueurs d'un duo sont **dans la même équipe actuellement**. Un duo historique devient invalide si un joueur est transféré.

```typescript
// Lors de la construction des duos, vérifier que les joueurs sont dans la même équipe
const duoStats = new Map<string, { count: number; players: string[]; isActive: boolean; team: string }>();

for (const stat of seasonStats || []) {
  if (stat.duo) {
    const duoKey = stat.duo.toLowerCase();
    const players = stat.duo.split('+').map((p: string) => p.trim());
    
    // Vérifier que les deux joueurs sont actifs
    const bothActive = players.every((p: string) => isPlayerActive(p));
    
    // NOUVEAU: Vérifier que les deux joueurs sont dans la même équipe
    const player1Team = getPlayerCurrentTeam(players[0]);
    const player2Team = getPlayerCurrentTeam(players[1]);
    const sameTeam = player1Team && player2Team && player1Team === player2Team;
    
    if (!duoStats.has(duoKey)) {
      duoStats.set(duoKey, { count: 0, players, isActive: bothActive && sameTeam, team: stat.team_abbr });
    }
    // ...
  }
}
```

### 3. Renforcer les instructions du prompt IA

Ajouter une règle stricte dans le prompt pour que l'IA ne propose **jamais** de duos qui ne sont pas explicitement listés dans les données.

```
## RÈGLES CRITIQUES

⛔ NE JAMAIS inventer de duos ou de joueurs qui ne sont pas dans les données ci-dessus.
⛔ Si la section "Duos Performants" est vide, le bloc DUO doit être null.
⛔ Utiliser UNIQUEMENT les joueurs listés dans "Buteurs pour les blocs DUO et FUN".
```

---

## Fichiers à Modifier

| Fichier | Modification |
|---------|--------------|
| `supabase/functions/betting-strategy/index.ts` | Ajouter vérification données vides + règle prompt + vérification équipe |

---

## Résultat Attendu

1. **Sans données** : Message clair "Données insuffisantes" au lieu de faux duos
2. **Avec données** : Seuls les duos où les deux joueurs sont actifs ET dans la même équipe seront proposés
3. **Rantanen + MacKinnon** : Ne sera plus jamais proposé car ils ne jouent plus ensemble

---

## Détails Techniques

La fonction `getPlayerCurrentTeam` utilisera la dernière entrée de `player_stats` pour déterminer l'équipe actuelle d'un joueur :

```typescript
// Map des équipes actuelles des joueurs (basée sur leur dernier match)
const playerCurrentTeam = new Map<string, string>();
for (const stat of activityStats || []) {
  const key = stat.scorer.toLowerCase();
  if (!playerCurrentTeam.has(key)) {
    // On prend l'équipe du match le plus récent
    playerCurrentTeam.set(key, stat.team_abbr);
  }
}

const getPlayerCurrentTeam = (playerName: string): string | null => {
  return playerCurrentTeam.get(playerName.toLowerCase()) || null;
};
```

