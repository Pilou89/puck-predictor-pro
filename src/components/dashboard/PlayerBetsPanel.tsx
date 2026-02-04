import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Brain, RefreshCw, Trophy, Flame, Zap, Shield, Sparkles } from "lucide-react";
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
  const { addBet } = useBankroll();
  const [players, setPlayers] = useState<PlayerSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [megaOdds, setMegaOdds] = useState<string>("");
  const [isPlacing, setIsPlacing] = useState(false);

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

      const tonightTeams = new Map<string, { match: string; time: string }>();
      tonightOdds?.forEach((o) => {
        const teams = extractTeamsFromMatch(o.match_name);
        teams.forEach((t) => tonightTeams.set(t, { match: `${teams[0]} @ ${teams[1]}`, time: o.commence_time }));
      });

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const { data: recentGoals } = await supabase
        .from("player_stats")
        .select("*")
        .gte("game_date", fourteenDaysAgo.toISOString().split("T")[0]);

      // Fusion des noms (Cole Caufield / C. Caufield)
      const statsByName = new Map<string, { goals: number; team: string }>();
      recentGoals?.forEach((g) => {
        if (!tonightTeams.has(g.team_abbr)) return;
        let key = g.scorer;
        if (key.match(/^[A-Z]\.\s/)) {
          const lastName = key.split(". ")[1];
          for (const existingName of statsByName.keys()) {
            if (existingName.endsWith(lastName) && !existingName.match(/^[A-Z]\.\s/)) {
              key = existingName;
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

      setPlayers(suggestions.sort((a, b) => b.confidence - a.confidence));
    } catch (err) {
      toast.error("Erreur d'analyse");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerSuggestions();
  }, []);

  // LOGIQUE MEGA FUN : 1 Buteur + 2 Points par match (sur 4 matchs max)
  const megaFunSelection = useMemo(() => {
    const selected: PlayerSuggestion[] = [];
    const matchGroups = new Map<string, PlayerSuggestion[]>();

    // Grouper les joueurs par match
    players.forEach((p) => {
      const group = matchGroups.get(p.match) || [];
      group.push(p);
      matchGroups.set(p.match, group);
    });

    // Pour chaque match, construire le trio (1 Buteur + 2 Points)
    for (const [match, group] of matchGroups) {
      if (selected.length >= 9) break; // Limite raisonnable de joueurs au total

      const scorer = group.find((p) => p.suggestedType === "Buteur");
      const points = group.filter((p) => p !== scorer).slice(0, 2);

      if (scorer) {
        selected.push({ ...scorer, suggestedType: "Buteur" });
        points.forEach((p) => selected.push({ ...p, suggestedType: "Point" }));
      } else {
        // Si pas de buteur net, on prend juste les 2 meilleurs en "Point"
        group.slice(0, 2).forEach((p) => selected.push({ ...p, suggestedType: "Point" }));
      }
    }
    return selected;
  }, [players]);

  const handlePlaceMegaFun = async () => {
    if (!megaOdds) return toast.error("Cote manquante");
    setIsPlacing(true);
    try {
      addBet({
        bet_date: new Date().toISOString().split("T")[0],
        match_name: "MEGA FUN CORRÉLÉ (1 BUT + 2 PTS)",
        bet_type: "MEGA_FUN",
        selection: megaFunSelection.map((p) => `${p.name} [${p.team}] (${p.suggestedType})`).join(" + "),
        odds: parseFloat(megaOdds),
        stake: 10,
        potential_gain: parseFloat(megaOdds) * 10,
        outcome: "pending",
        actual_gain: 0,
        source: "ai_mega_fun",
      });
      toast.success("Combiné corrélé enregistré !");
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <Card className="glass-card p-6 border-primary/20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="font-bold uppercase text-sm">Agent IA : Scénarios de Match</h3>
        </div>
        <Button onClick={fetchPlayerSuggestions} size="sm" variant="ghost" disabled={isLoading}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-6">
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-5 h-5 text-purple-500 animate-pulse" />
              <span className="text-xs font-black text-purple-400 uppercase italic">
                Vibration Mega Fun : 1 Buteur + 2 Passeurs
              </span>
            </div>

            <div className="bg-gradient-to-br from-purple-950/40 to-black border-2 border-purple-500/30 rounded-xl p-4">
              <div className="space-y-4 mb-4">
                {/* On regroupe visuellement par match pour que tu vois le trio */}
                {Array.from(new Set(megaFunSelection.map((p) => p.match))).map((matchName) => (
                  <div key={matchName} className="border-l-2 border-purple-500/30 pl-3 space-y-1">
                    <p className="text-[9px] text-gray-500 font-bold mb-1">{matchName}</p>
                    {megaFunSelection
                      .filter((p) => p.match === matchName)
                      .map((p, i) => (
                        <div key={i} className="flex justify-between items-center bg-white/5 p-1 px-2 rounded">
                          <span className="text-[11px] font-bold">
                            {p.name}{" "}
                            <Badge variant="outline" className="text-[7px] py-0 ml-1 opacity-70">
                              {p.team}
                            </Badge>
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${p.suggestedType === "Buteur" ? "border-orange-500 text-orange-500" : "border-purple-500 text-purple-300"}`}
                          >
                            {p.suggestedType}
                          </Badge>
                        </div>
                      ))}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold">@</span>
                  <Input
                    placeholder="Cote Totale"
                    type="number"
                    value={megaOdds}
                    onChange={(e) => setMegaOdds(e.target.value)}
                    className="pl-8 bg-black/60 border-purple-500/40 text-purple-400 font-bold"
                  />
                </div>
                <Button
                  onClick={handlePlaceMegaFun}
                  disabled={isPlacing || !megaOdds}
                  className="bg-purple-600 hover:bg-purple-500"
                >
                  {isPlacing ? <RefreshCw className="animate-spin" /> : <Trophy className="w-4 h-4" />}
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
