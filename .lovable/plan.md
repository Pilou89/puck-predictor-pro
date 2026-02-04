

# Plan : Activer les blocs DUO et FUN

## Diagnostic

Les logs montrent clairement :
```
Données envoyées à l'IA: 0 buteurs actifs, 0 duos actifs
```

### Cause 1 : Pas de duos
L'endpoint `boxscore/playerByGameStats` ne fournit pas les assistants sur chaque but. Le code assigne `assist1: undefined` donc `duo = null` pour tous les buts.

### Cause 2 : Pas de cotes buteurs
The Odds API ne propose pas le marché `player_anytime_goal_scorer` pour la région FR. Seules les cotes H2H (victoire) sont disponibles.

---

## Solution

### 1. Récupérer les vrais duos via Play-By-Play

Utiliser l'endpoint NHL `play-by-play` qui contient les détails complets de chaque but :
- `https://api-web.nhle.com/v1/gamecenter/{gameId}/play-by-play`

Cet endpoint retourne pour chaque but :
- `scoringPlayerId` + nom du buteur
- `assist1PlayerId` + nom de l'assistant 1
- `assist2PlayerId` + nom de l'assistant 2
- `goalModifier` (PP, SH, EN, etc.)

### 2. Récupérer les cotes buteurs via région US

Ajouter une requête secondaire à The Odds API avec `regions=us` pour le marché `player_anytime_goal_scorer`. Les bookmakers US (DraftKings, FanDuel, BetMGM) proposent ces cotes.

### 3. Adapter la stratégie FUN

Si aucune cote buteur n'est disponible, le bloc FUN pourra utiliser une cote H2H d'outsider (cote > 4.00).

---

## Fichiers à Modifier

| Fichier | Modification |
|---------|--------------|
| `supabase/functions/sync-nhl-stats/index.ts` | Remplacer `boxscore` par `play-by-play` pour extraire les vrais duos |
| `supabase/functions/sync-winamax-odds/index.ts` | Ajouter une requête US pour les cotes buteurs |
| `supabase/functions/betting-strategy/index.ts` | Fallback FUN sur H2H outsider si pas de cotes buteurs |

---

## Détails Techniques

### Modification sync-nhl-stats

Ajouter une fonction pour extraire les buts depuis play-by-play :

```typescript
async function fetchGamePlayByPlay(gameId: string): Promise<GoalData[]> {
  const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`;
  const response = await fetch(url);
  if (!response.ok) return [];
  
  const data = await response.json();
  const goals: GoalData[] = [];
  
  for (const play of data.plays || []) {
    if (play.typeDescKey === 'goal') {
      const details = play.details || {};
      
      goals.push({
        scorer: details.scoringPlayerName || details.scoringPlayerFirstName + ' ' + details.scoringPlayerLastName,
        scorerTeamAbbr: details.eventOwnerTeamId, // Will need mapping
        assist1: details.assist1PlayerName || null,
        assist2: details.assist2PlayerName || null,
        situation: play.situationCode?.includes('PP') ? 'PP' : 'EV',
        period: play.periodDescriptor?.number || 0,
        timeInPeriod: play.timeInPeriod || '00:00',
      });
    }
  }
  
  return goals;
}
```

### Modification sync-winamax-odds

Ajouter une requête pour les cotes buteurs US :

```typescript
// Fetch goal scorer odds from US region (DraftKings, FanDuel)
const usUrl = `${baseUrl}?apiKey=${oddsApiKey}&regions=us&markets=player_anytime_goal_scorer`;
const usResponse = await fetch(usUrl);

if (usResponse.ok) {
  const usData = await usResponse.json();
  for (const game of usData) {
    // Extract from any US bookmaker (DraftKings preferred)
    const bookmaker = game.bookmakers?.find(b => 
      ['draftkings', 'fanduel', 'betmgm'].includes(b.key)
    );
    // ... insert goal scorer odds
  }
}
```

### Modification betting-strategy

Fallback FUN sur cote H2H outsider :

```typescript
// Si pas de goal scorer odds, utiliser H2H outsider pour FUN
const funFromH2H = h2hOdds
  .filter(o => o.price >= 4.00) // Grosse cote = outsider
  .slice(0, 5)
  .map(o => ({
    player: o.selection, // C'est une équipe, pas un joueur
    match: o.match_name,
    odds: o.price,
    type: 'H2H_OUTSIDER',
  }));
```

---

## Résultat Attendu

Après ces modifications :
1. **Duos** : La table `player_stats` contiendra les vrais duos buteur+assistant
2. **Cotes buteurs** : Les cotes US seront disponibles dans `winamax_odds` (marché `player_anytime_goal_scorer`)
3. **Bloc FUN** : Toujours disponible via cote buteur US ou H2H outsider
4. **Bloc DUO** : Généré à partir des duos performants de la saison

