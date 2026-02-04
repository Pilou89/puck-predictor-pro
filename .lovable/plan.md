
# Plan : Corriger la synchronisation des cotes Winamax

## Problème Identifié

D'après les logs de la fonction `sync-winamax-odds` :
- **H2H : 10 matchs reçus** mais 0 cotes insérées
- **Player props : erreur 422** (marché non supporté pour EU/FR)

L'API retourne des matchs mais **aucun bookmaker Winamax n'est trouvé** car :
1. La clé utilisée est `winamax` au lieu de `winamax_fr`
2. L'API ne supporte pas le filtre `bookmakers=` pour limiter à un seul bookmaker - il faut utiliser `regions=fr` et filtrer côté code
3. Les marchés `player_anytime_goal_scorer` et `player_points` ne sont **pas disponibles pour la NHL en région FR/EU** (uniquement US)

---

## Solution

### 1. Corriger la requête API

Modifier l'URL pour utiliser la région `fr` sans filtre bookmaker, puis filtrer côté code :

```typescript
// AVANT (ne fonctionne pas)
const url = `${baseUrl}?apiKey=${oddsApiKey}&regions=eu&markets=${market}&bookmakers=winamax`;

// APRÈS (correct)
const url = `${baseUrl}?apiKey=${oddsApiKey}&regions=fr&markets=${market}`;
```

### 2. Corriger le filtre bookmaker

Chercher la clé exacte `winamax_fr` dans la réponse :

```typescript
// AVANT
const winamax = game.bookmakers?.find((b: any) => 
  b.key === 'winamax' || b.title?.toLowerCase().includes('winamax')
);

// APRÈS
const winamax = game.bookmakers?.find((b: any) => 
  b.key === 'winamax_fr'
);
```

### 3. Limiter aux marchés disponibles

Seul le marché `h2h` (victoire) est disponible pour la NHL en région FR. Les marchés `player_anytime_goal_scorer` et `player_points` ne sont disponibles que pour les bookmakers US.

Options :
- **Option A** : Garder uniquement `h2h` pour FR (approche simple)
- **Option B** : Ajouter une deuxième requête avec `regions=us` pour récupérer les player props de bookmakers US (DraftKings, FanDuel, etc.)

Je recommande l'**Option A** pour l'instant car l'objectif est d'avoir des cotes H2H pour le bloc SAFE.

### 4. Ajouter des logs de debug

Pour comprendre ce que l'API retourne, ajouter un log des bookmakers disponibles :

```typescript
for (const game of data) {
  console.log(`Game: ${game.home_team} vs ${game.away_team}`);
  console.log(`Bookmakers: ${game.bookmakers?.map(b => b.key).join(', ')}`);
  // ...
}
```

---

## Fichiers à Modifier

| Fichier | Modification |
|---------|--------------|
| `supabase/functions/sync-winamax-odds/index.ts` | Corriger la requête API et le filtre bookmaker |

---

## Résultat Attendu

Après correction :
1. Les cotes H2H Winamax seront récupérées et insérées dans `winamax_odds`
2. La fonction `betting-strategy` pourra générer un bloc SAFE avec ces données
3. Les erreurs 422 pour les player props disparaîtront (marchés retirés de la liste)

---

## Détails Techniques

### Code corrigé

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const oddsApiKey = Deno.env.get('THE_ODDS_API_KEY');
    
    if (!oddsApiKey) {
      throw new Error('THE_ODDS_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Starting Winamax odds sync...');

    const baseUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds';
    
    // Seul le marché h2h est disponible pour la NHL en région FR
    const markets = ['h2h'];
    const oddsToInsert: any[] = [];

    for (const market of markets) {
      try {
        // Utiliser la région FR pour avoir Winamax
        const url = `${baseUrl}?apiKey=${oddsApiKey}&regions=fr&markets=${market}`;
        console.log(`Fetching ${market} odds from FR region...`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch ${market} odds: ${response.status} - ${errorText}`);
          continue;
        }

        const data = await response.json();
        console.log(`Received ${data.length} games for ${market}`);

        for (const game of data) {
          const commenceTime = new Date(game.commence_time);
          const matchName = `${game.away_team} @ ${game.home_team}`;
          
          // Log des bookmakers disponibles pour debug
          const bookmakerKeys = game.bookmakers?.map((b: any) => b.key) || [];
          console.log(`Match: ${matchName} - Bookmakers: ${bookmakerKeys.join(', ')}`);

          // Chercher Winamax FR avec la bonne clé
          const winamax = game.bookmakers?.find((b: any) => b.key === 'winamax_fr');

          if (!winamax) {
            console.log(`No Winamax for ${matchName}`);
            continue;
          }

          for (const marketData of winamax.markets || []) {
            for (const outcome of marketData.outcomes || []) {
              oddsToInsert.push({
                commence_time: commenceTime.toISOString(),
                match_name: matchName,
                selection: outcome.name,
                price: outcome.price,
                market_type: 'h2h',
                fetched_at: new Date().toISOString(),
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching ${market} odds:`, error);
      }
    }

    console.log(`Total Winamax odds collected: ${oddsToInsert.length}`);

    if (oddsToInsert.length > 0) {
      const matchNames = [...new Set(oddsToInsert.map(o => o.match_name))];
      
      await supabase
        .from('winamax_odds')
        .delete()
        .in('match_name', matchNames);

      const { error: insertError } = await supabase
        .from('winamax_odds')
        .insert(oddsToInsert);

      if (insertError) {
        console.error('Error inserting odds:', insertError);
        throw insertError;
      }

      console.log(`Inserted ${oddsToInsert.length} Winamax odds records`);
    }

    await supabase
      .from('cron_config')
      .update({ last_run_at: new Date().toISOString() })
      .eq('job_name', 'sync_winamax_odds');

    return new Response(
      JSON.stringify({
        success: true,
        oddsRecorded: oddsToInsert.length,
        matchesProcessed: [...new Set(oddsToInsert.map(o => o.match_name))].length,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Sync Winamax odds error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
```
