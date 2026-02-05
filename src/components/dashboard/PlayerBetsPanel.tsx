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

      const today = new Date().toISOString().split("T")[0];
      const { data: tonightOdds } = await supabase
        .from("winamax_odds")
        .select("*")
        .gte("commence_time", `${today}T00:00:00Z`)
        .lte("commence_time", `${today}T23:59:59Z`);

      const tonightTeams = new Map<string, { match: string; time: string }>();
      tonightOdds?.forEach((o) => {
        const teams = extractTeamsFromMatch(o.match_name);
        teams.forEach((t) => tonightTeams.set(t, { match: o.match_name, time: o.commence_time }));
      });

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const { data: recentGoals } = await supabase
        .from("player_stats")
        .select("*")
        .gte("game_date", fourteenDaysAgo.toISOString().split("T")[0]);

      // Construction SANS DOUBLONS de joueurs
      const playerStatsMap = new Map<string, { goals: number; team: string }>();
      recentGoals?.forEach((g) => {
        const teamName = getFullTeamName(g.team_abbr);
        if (tonightTeams.has(teamName)) {
          const existing = playerStatsMap.get(g.scorer) || { goals: 0, team: teamName };
          existing.goals++;
          playerStatsMap.set(g.scorer, existing);
        }
      });

      const suggestions: PlayerSuggestion[] = [];
      playerStatsMap.forEach((stats, playerName) => {
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
          reasoning: stats.goals >= 3 ? "🔥 Elite Finisher" : "Régulier",
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
    } catch (err) {
      toast.error("Erreur lors de l'analyse");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerSuggestions();
  }, []);

  // LOGIQUE AGENT IA : Sélection de 4 matchs différents, max 2 joueurs par match
  const megaFunSelection = useMemo(() => {
    const selected: PlayerSuggestion[] = [];
    const matchCounts = new Map<string, number>();
    const uniqueMatches = new Set<string>();

    for (const p of players) {
      const count = matchCounts.get(p.match) || 0;

      // On prend si : on n'a pas encore 4 matchs OU si on a déjà le match mais moins de 2 joueurs
      if (uniqueMatches.size < 4 || uniqueMatches.has(p.match)) {
        if (count < 2) {
          // Max 2 joueurs par match pour varier
          selected.push(p);
          matchCounts.set(p.match, count + 1);
          uniqueMatches.add(p.match);
        }
      }

      // On s'arrête quand on a un bon combo (ex: 6 joueurs sur au moins 4 matchs)
      if (selected.length >= 6 && uniqueMatches.size >= 4) break;
    }
    return selected;
  }, [players]);

  const handlePlaceMegaFun = async () => {
    if (!megaOdds) return toast.error("Entrez la cote finale");
    setIsPlacing(true);
    try {
      addBet({
        bet_date: new Date().toISOString().split("T")[0],
        match_name: "MEGA FUN (4+ MATCHS)",
        bet_type: "MEGA_FUN",
        selection: megaFunSelection.map((p) => `${p.name} (${p.suggestedType})`).join(" + "),
        odds: parseFloat(megaOdds),
        stake: 10,
        potential_gain: parseFloat(megaOdds) * 10,
        outcome: "pending",
        actual_gain: 0,
        source: "ai_mega_fun",
      });
      toast.success("Combo 4 matchs enregistré !");
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <Card className="glass-card p-6 border-primary/20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="font-bold uppercase text-sm tracking-tighter">Agent IA : Scouting Joueurs</h3>
        </div>
        <Button onClick={fetchPlayerSuggestions} size="sm" variant="ghost" disabled={isLoading}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-6">
          {/* Grille Classique */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-green-500 uppercase flex items-center gap-1">
                <Shield className="w-3 h-3" /> Top Sûrs
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
                      {p.name} <span className="text-[9px] opacity-50 block">{p.team}</span>
                    </span>
                    <Badge className="bg-green-500/20 text-green-500 text-[9px]">{p.confidence}%</Badge>
                  </div>
                ))}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-orange-500 uppercase flex items-center gap-1">
                <Zap className="w-3 h-3" /> Fun / Décisifs
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
                      {p.name} <span className="text-[9px] opacity-50 block">{p.team}</span>
                    </span>
                    <Badge className="bg-orange-500/20 text-orange-500 text-[9px]">{p.confidence}%</Badge>
                  </div>
                ))}
            </div>
          </div>

          {/* VIBRATION MEGA FUN - VARIÉ SUR 4 MATCHS */}
          <div className="pt-4 border-t border-purple-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-purple-500 animate-pulse" />
                <span className="text-xs font-black text-purple-400 uppercase italic">
                  Vibration Mega Fun (4 Matchs)
                </span>
              </div>
              <Badge variant="outline" className="text-[9px] border-purple-500/50 text-purple-300 italic">
                {new Set(megaFunSelection.map((p) => p.match)).size} matchs couverts
              </Badge>
            </div>

            <div className="bg-gradient-to-br from-purple-950/40 to-black border-2 border-purple-500/30 rounded-xl p-4">
              <div className="space-y-2 mb-4">
                {megaFunSelection.map((p, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center bg-white/5 p-2 rounded border border-white/5"
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold">{p.name}</span>
                      <span className="text-[8px] text-gray-500 uppercase">
                        {p.match.split(" vs ")[0]} @ {p.match.split(" vs ")[1]}
                      </span>
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
                    placeholder="Cote Finale"
                    type="number"
                    value={megaOdds}
                    onChange={(e) => setMegaOdds(e.target.value)}
                    className="pl-8 bg-black/60 border-purple-500/40 text-purple-400 font-bold"
                  />
                </div>
                <Button
                  onClick={handlePlaceMegaFun}
                  disabled={isPlacing || !megaOdds}
                  className="bg-purple-600 hover:bg-purple-500 px-6"
                >
                  {isPlacing ? <RefreshCw className="animate-spin w-4 h-4" /> : <Trophy className="w-4 h-4" />}
                </Button>
              </div>
              {megaOdds && (
                <p className="text-[10px] text-green-400 text-center mt-2 font-mono">
                  Potential: +{(parseFloat(megaOdds) * 10).toLocaleString()}€
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// Helpers techniques
function getFullTeamName(abbr: string): string {
  const teams: Record<string, string> = {
    TOR: "Toronto Maple Leafs",
    MTL: "Canadiens de Montréal",
    BOS: "Boston Bruins",
    NYR: "New York Rangers",
    NYI: "New York Islanders",
    NJD: "New Jersey Devils",
    PHI: "Philadelphia Flyers",
    PIT: "Pittsburgh Penguins",
    WSH: "Washington Capitals",
    CAR: "Carolina Hurricanes",
    TBL: "Tampa Bay Lightning",
    FLA: "Florida Panthers",
    DET: "Detroit Red Wings",
    BUF: "Buffalo Sabres",
    OTT: "Ottawa Senators",
    CBJ: "Columbus Blue Jackets",
    WPG: "Winnipeg Jets",
    MIN: "Minnesota Wild",
    CHI: "Chicago Blackhawks",
    STL: "St. Louis Blues",
    NSH: "Nashville Predators",
    DAL: "Dallas Stars",
    COL: "Colorado Avalanche",
    ANA: "Anaheim Ducks",
    LAK: "Los Angeles Kings",
    SJS: "San Jose Sharks",
    VGK: "Vegas Golden Knights",
    SEA: "Seattle Kraken",
    VAN: "Vancouver Canucks",
    CGY: "Calgary Flames",
    EDM: "Edmonton Oilers",
    UTA: "Utah Hockey Club",
    ARI: "Arizona Coyotes",
  };
  return teams[abbr.toUpperCase()] || abbr;
}

function extractTeamsFromMatch(matchName: string): string[] {
  const parts = matchName.split(/\s+(?:vs|@|at)\s+/i);
  return parts.map((p) => getFullTeamNameFromSearch(p));
}

function getFullTeamNameFromSearch(p: string): string {
  const lower = p.toLowerCase();
  if (lower.includes("toronto") || lower.includes("maple leafs")) return "Toronto Maple Leafs";
  if (lower.includes("montreal") || lower.includes("canadiens")) return "Canadiens de Montréal";
  if (lower.includes("boston") || lower.includes("bruins")) return "Boston Bruins";
  if (lower.includes("rangers")) return "New York Rangers";
  if (lower.includes("islanders")) return "New York Islanders";
  if (lower.includes("devils")) return "New Jersey Devils";
  if (lower.includes("flyers")) return "Philadelphia Flyers";
  if (lower.includes("penguins")) return "Pittsburgh Penguins";
  if (lower.includes("capitals")) return "Washington Capitals";
  if (lower.includes("hurricanes")) return "Carolina Hurricanes";
  if (lower.includes("lightning")) return "Tampa Bay Lightning";
  if (lower.includes("panthers")) return "Florida Panthers";
  if (lower.includes("red wings")) return "Detroit Red Wings";
  if (lower.includes("sabres")) return "Buffalo Sabres";
  if (lower.includes("senators")) return "Ottawa Senators";
  if (lower.includes("blue jackets")) return "Columbus Blue Jackets";
  if (lower.includes("jets")) return "Winnipeg Jets";
  if (lower.includes("wild")) return "Minnesota Wild";
  if (lower.includes("blackhawks")) return "Chicago Blackhawks";
  if (lower.includes("blues")) return "St. Louis Blues";
  if (lower.includes("predators")) return "Nashville Predators";
  if (lower.includes("stars")) return "Dallas Stars";
  if (lower.includes("avalanche")) return "Colorado Avalanche";
  if (lower.includes("ducks")) return "Anaheim Ducks";
  if (lower.includes("kings")) return "Los Angeles Kings";
  if (lower.includes("sharks")) return "San Jose Sharks";
  if (lower.includes("golden knights")) return "Vegas Golden Knights";
  if (lower.includes("kraken")) return "Seattle Kraken";
  if (lower.includes("canucks")) return "Vancouver Canucks";
  if (lower.includes("flames")) return "Calgary Flames";
  if (lower.includes("oilers")) return "Edmonton Oilers";
  if (lower.includes("utah")) return "Utah Hockey Club";
  return p;
}
