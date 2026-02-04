import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Brain, RefreshCw, Trophy, Flame, Zap, Shield, Sparkles, Target, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useBankroll } from "@/hooks/useBankroll";

interface PlayerSuggestion {
  id: string;
  name: string;
  team: string;
  match: string;
  matchTime: string;
  goalsLast14: number;
  confidence: number;
  reasoning: string;
  category: "SAFE" | "FUN" | "MEGA_FUN";
  suggestedType: "Buteur" | "Point";
}

export function PlayerBetsPanel() {
  const { addBet, isUpdating } = useBankroll();
  const [players, setPlayers] = useState<PlayerSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [megaOdds, setMegaOdds] = useState<string>("");
  const [isPlacing, setIsPlacing] = useState<string | null>(null);

  const fetchPlayerSuggestions = async () => {
    setIsLoading(true);
    try {
      const { data: metrics } = await supabase.from("learning_metrics").select("*").eq("metric_type", "player");
      const boosts = new Map<string, number>();
      metrics?.forEach((m) => boosts.set(m.metric_key.toLowerCase(), m.confidence_adjustment || 0));

      const { data: tonightOdds } = await supabase
        .from("winamax_odds")
        .select("*")
        .eq("market_type", "h2h")
        .gte("commence_time", new Date().toISOString())
        .order("commence_time", { ascending: true })
        .limit(40);

      const tonightTeams = new Map<string, { match: string; time: string; opponent: string }>();
      tonightOdds?.forEach((o) => {
        const teams = extractTeamsFromMatch(o.match_name);
        if (teams.length === 2) {
          tonightTeams.set(teams[0], { match: `${teams[0]} @ ${teams[1]}`, time: o.commence_time, opponent: teams[1] });
          tonightTeams.set(teams[1], { match: `${teams[0]} @ ${teams[1]}`, time: o.commence_time, opponent: teams[0] });
        }
      });

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const { data: recentGoals } = await supabase
        .from("player_stats")
        .select("*")
        .gte("game_date", fourteenDaysAgo.toISOString().split("T")[0]);

      // --- DÉDOUBLONNAGE ET NORMALISATION DES NOMS ---
      const statsByName = new Map<string, { goals: number; team: string }>();

      recentGoals?.forEach((g) => {
        if (!tonightTeams.has(g.team_abbr)) return;

        // On normalise : on cherche si une version longue du nom existe déjà
        let key = g.scorer;
        const isShortName = key.match(/^[A-Z]\.\s/);

        if (isShortName) {
          const lastName = key.split(". ")[1];
          for (const existingName of statsByName.keys()) {
            if (existingName.endsWith(lastName) && !existingName.match(/^[A-Z]\.\s/)) {
              key = existingName; // On fusionne vers le nom complet
              break;
            }
          }
        }

        const existing = statsByName.get(key) || { goals: 0, team: g.team_abbr };
        existing.goals++;
        statsByName.set(key, existing);
      });

      const suggestions: PlayerSuggestion[] = [];
      statsByName.forEach((stats, playerName) => {
        const matchInfo = tonightTeams.get(stats.team)!;
        const playerBoost = boosts.get(playerName.toLowerCase()) || 0;
        let confidence = 55 + playerBoost + stats.goals * 4;

        suggestions.push({
          id: `player-${playerName.replace(/\s+/g, "-").toLowerCase()}`,
          name: playerName,
          team: stats.team,
          match: matchInfo.match,
          matchTime: matchInfo.time,
          goalsLast14: stats.goals,
          confidence: Math.min(confidence, 98),
          reasoning: stats.goals >= 3 ? "🔥 En feu" : "Régulier",
          category: "SAFE",
          suggestedType: stats.goals >= 2 ? "Buteur" : "Point",
        });
      });

      const sorted = suggestions.sort((a, b) => b.confidence - a.confidence);
      sorted.forEach((p, i) => {
        if (i < 3) p.category = "SAFE";
        else if (i < 8) p.category = "FUN";
        else p.category = "MEGA_FUN";
      });

      setPlayers(sorted);
      toast.success("IA : Scouting terminé");
    } catch (err) {
      toast.error("Erreur de synchronisation");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerSuggestions();
  }, []);

  // --- LOGIQUE MEGA FUN : 4 MATCHS DIFFÉRENTS, MAX 2 JOUEURS PAR MATCH ---
  const megaFunSelection = useMemo(() => {
    const selected: PlayerSuggestion[] = [];
    const matchCounts = new Map<string, number>();
    const uniqueMatchIds = new Set<string>();

    for (const p of players) {
      const currentMatchCount = matchCounts.get(p.match) || 0;

      // On accepte le joueur si on n'a pas encore atteint le quota de matchs ou si on complète un match existant
      if (uniqueMatchIds.size < 4 || uniqueMatchIds.has(p.match)) {
        if (currentMatchCount < 2) {
          selected.push(p);
          matchCounts.set(p.match, currentMatchCount + 1);
          uniqueMatchIds.add(p.match);
        }
      }
      if (selected.length >= 6 && uniqueMatchIds.size >= 4) break;
    }
    return selected;
  }, [players]);

  const handlePlaceMegaFun = async () => {
    if (!megaOdds) return toast.error("Saisissez la cote");
    setIsPlacing("mega");
    try {
      addBet({
        bet_date: new Date().toISOString().split("T")[0],
        match_name: "COMBO IA MEGA FUN",
        bet_type: "MEGA_FUN",
        selection: megaFunSelection.map((p) => `${p.name} (${p.suggestedType})`).join(" + "),
        odds: parseFloat(megaOdds),
        stake: 10,
        potential_gain: parseFloat(megaOdds) * 10,
        outcome: "pending",
        actual_gain: 0,
        source: "ai_mega_fun",
      });
      toast.success("Mega Fun enregistré !");
    } finally {
      setIsPlacing(null);
    }
  };

  return (
    <Card className="glass-card p-6 border-primary/20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="font-bold uppercase text-sm">Agent IA : Scouting Joueurs</h3>
        </div>
        <Button onClick={fetchPlayerSuggestions} size="sm" variant="ghost" disabled={isLoading}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-green-500 uppercase flex items-center gap-1">
                <Shield className="w-3 h-3" /> Top Safe
              </p>
              {players
                .filter((p) => p.category === "SAFE")
                .slice(0, 3)
                .map((p) => (
                  <div
                    key={p.id}
                    className="p-2 rounded border border-green-500/10 bg-green-500/5 flex justify-between items-center"
                  >
                    <span className="text-xs font-bold">
                      {p.name}{" "}
                      <Badge variant="outline" className="text-[9px] ml-1">
                        {p.team}
                      </Badge>
                    </span>
                    <Badge className="bg-green-500/20 text-green-500 text-[9px]">{p.confidence}%</Badge>
                  </div>
                ))}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-orange-500 uppercase flex items-center gap-1">
                <Zap className="w-3 h-3" /> Top Fun
              </p>
              {players
                .filter((p) => p.category === "FUN")
                .slice(0, 3)
                .map((p) => (
                  <div
                    key={p.id}
                    className="p-2 rounded border border-orange-500/10 bg-orange-500/5 flex justify-between items-center"
                  >
                    <span className="text-xs font-bold">
                      {p.name}{" "}
                      <Badge variant="outline" className="text-[9px] ml-1">
                        {p.team}
                      </Badge>
                    </span>
                    <Badge className="bg-orange-500/20 text-orange-500 text-[9px]">{p.confidence}%</Badge>
                  </div>
                ))}
            </div>
          </div>

          <div className="pt-4 border-t border-purple-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-5 h-5 text-purple-500 animate-pulse" />
              <span className="text-xs font-black text-purple-400 uppercase italic">
                Vibration Mega Fun (4 Matchs Variés)
              </span>
            </div>

            <div className="bg-gradient-to-br from-purple-950/40 to-black border-2 border-purple-500/30 rounded-xl p-4">
              <div className="space-y-2 mb-4">
                {megaFunSelection.map((p, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center bg-white/5 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold">{p.name}</span>
                      <span className="text-[8px] text-gray-500 uppercase font-mono">{p.match}</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] border-purple-500/50 text-purple-300">
                      {p.suggestedType}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold">@</span>
                  <Input
                    placeholder="Cote Finale Bookmaker"
                    type="number"
                    value={megaOdds}
                    onChange={(e) => setMegaOdds(e.target.value)}
                    className="pl-8 bg-black/60 border-purple-500/40 text-purple-400 font-bold"
                  />
                </div>
                <Button
                  onClick={handlePlaceMegaFun}
                  disabled={isPlacing === "mega" || !megaOdds}
                  className="bg-purple-600 hover:bg-purple-500"
                >
                  {isPlacing === "mega" ? <RefreshCw className="animate-spin" /> : <Trophy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function extractTeamsFromMatch(matchName: string): string[] {
  const teamMappings: Record<string, string> = {
    "maple leafs": "TOR",
    toronto: "TOR",
    canadiens: "MTL",
    montreal: "MTL",
    bruins: "BOS",
    boston: "BOS",
    rangers: "NYR",
    islanders: "NYI",
    devils: "NJD",
    flyers: "PHI",
    penguins: "PIT",
    capitals: "WSH",
    hurricanes: "CAR",
    lightning: "TBL",
    panthers: "FLA",
    "red wings": "DET",
    sabres: "BUF",
    senators: "OTT",
    "blue jackets": "CBJ",
    jets: "WPG",
    wild: "MIN",
    blackhawks: "CHI",
    blues: "STL",
    predators: "NSH",
    stars: "DAL",
    avalanche: "COL",
    coyotes: "ARI",
    ducks: "ANA",
    kings: "LAK",
    sharks: "SJS",
    "golden knights": "VGK",
    kraken: "SEA",
    canucks: "VAN",
    flames: "CGY",
    oilers: "EDM",
    utah: "UTA",
  };

  const parts = matchName.split(/\s+(?:vs|@|at)\s+/i);
  const teams: string[] = [];
  parts.forEach((part) => {
    const lower = part.toLowerCase();
    for (const [key, abbr] of Object.entries(teamMappings)) {
      if (lower.includes(key)) {
        teams.push(abbr);
        break;
      }
    }
  });
  return teams;
}
