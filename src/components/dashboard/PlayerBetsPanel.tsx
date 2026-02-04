import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  User,
  Shield,
  Zap,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Target,
  DollarSign,
  Brain,
  Trophy,
  Calculator,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { useBankroll } from "@/hooks/useBankroll";

interface PlayerSuggestion {
  id: string;
  name: string;
  team: string;
  match: string;
  matchTime: string;
  goalsLast14: number;
  ppGoals: number;
  confidence: number;
  reasoning: string;
  category: "SAFE" | "FUN" | "SUPER_COMBO" | "MEGA_FUN";
  learningBoost: number;
}

export function PlayerBetsPanel() {
  const { addBet, isUpdating } = useBankroll();
  const [players, setPlayers] = useState<PlayerSuggestion[]>([]);
  const [oddsInputs, setOddsInputs] = useState<Record<string, { odds: string; betType: "Buteur" | "Point" }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stakePerCombo, setStakePerCombo] = useState(0.25);
  const [isPlacing, setIsPlacing] = useState<string | null>(null);
  const [megaOdds, setMegaOdds] = useState<string>("");

  const fetchPlayerSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: metrics } = await supabase.from("learning_metrics").select("*").eq("metric_type", "player");
      const boosts = new Map<string, number>();
      metrics?.forEach((m) => boosts.set(m.metric_key.toLowerCase(), m.confidence_adjustment || 0));

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: recentGoals } = await supabase
        .from("player_stats")
        .select("*")
        .gte("game_date", fourteenDaysAgo.toISOString().split("T")[0]);

      const { data: tonightOdds } = await supabase
        .from("winamax_odds")
        .select("*")
        .eq("market_type", "h2h")
        .gte("commence_time", new Date().toISOString());

      const tonightTeams = new Set<string>();
      const tonightMatches: Record<string, { match: string; time: string }> = {};

      tonightOdds?.forEach((o) => {
        const teams = extractTeamsFromMatch(o.match_name);
        teams.forEach((t) => {
          tonightTeams.add(t);
          tonightMatches[t] = { match: o.match_name, time: o.commence_time };
        });
      });

      const playerStatsMap = new Map<string, { goals: number; team: string }>();
      recentGoals?.forEach((g) => {
        const key = g.scorer;
        const existing = playerStatsMap.get(key) || { goals: 0, team: g.team_abbr };
        existing.goals++;
        playerStatsMap.set(key, existing);
      });

      const suggestions: PlayerSuggestion[] = [];
      playerStatsMap.forEach((stats, playerName) => {
        if (!tonightTeams.has(stats.team)) return;
        const matchInfo = tonightMatches[stats.team];
        const playerBoost = boosts.get(playerName.toLowerCase()) || 0;
        let confidence = 50 + playerBoost + stats.goals * 5;

        suggestions.push({
          id: `player-${playerName.replace(/\s+/g, "-").toLowerCase()}`,
          name: playerName,
          team: stats.team,
          match: matchInfo.match,
          matchTime: matchInfo.time,
          goalsLast14: stats.goals,
          ppGoals: 0,
          confidence: Math.min(confidence, 95),
          reasoning: stats.goals > 2 ? `🔥 En feu (${stats.goals} buts)` : "Régulier",
          category: "SAFE",
          learningBoost: playerBoost,
        });
      });

      suggestions.sort((a, b) => b.confidence - a.confidence);
      suggestions.forEach((p, idx) => {
        if (idx < 3) p.category = "SAFE";
        else if (idx < 6) p.category = "FUN";
        else p.category = "SUPER_COMBO";
      });

      setPlayers(suggestions.slice(0, 15));
    } catch (err) {
      setError("Erreur lors de l'analyse IA");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerSuggestions();
  }, []);

  // AGENT IA : Sélection automatique pour le MEGA FUN
  const megaFunIA = useMemo(() => {
    return players
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6)
      .map((p) => ({
        ...p,
        suggestedType: p.goalsLast14 >= 2 ? "Buteur" : "Point",
      }));
  }, [players]);

  const handlePlaceMegaFun = async () => {
    if (!megaOdds || parseFloat(megaOdds) <= 1) {
      toast.error("Saisissez la cote totale du bookmaker");
      return;
    }
    setIsPlacing("mega");
    try {
      addBet({
        bet_date: new Date().toISOString().split("T")[0],
        match_name: "COMBO MULTI-MATCHS IA",
        bet_type: "MEGA_FUN_COMBO",
        selection: megaFunIA.map((p) => `${p.name} (${p.suggestedType})`).join(" + "),
        odds: parseFloat(megaOdds),
        stake: 10,
        potential_gain: parseFloat(megaOdds) * 10,
        outcome: "pending",
        actual_gain: 0,
        source: "ai_mega_fun",
        notes: `Ticket généré par l'Agent IA • 6 joueurs sélectionnés`,
      });
      toast.success("Ticket Mega Fun enregistré ! 🚀");
    } catch (err) {
      toast.error("Erreur bankroll");
    } finally {
      setIsPlacing(null);
    }
  };

  const renderPlayerCard = (p: PlayerSuggestion, color: string) => (
    <div key={p.id} className={`p-3 rounded-lg border ${color} bg-card/50 flex justify-between items-center`}>
      <div>
        <p className="font-bold text-sm">
          {p.name}{" "}
          <Badge variant="outline" className="text-[10px] ml-1">
            {p.team}
          </Badge>
        </p>
        <p className="text-[10px] text-muted-foreground">{p.match}</p>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold text-primary">{p.confidence}%</p>
        <p className="text-[9px] text-muted-foreground italic">{p.reasoning}</p>
      </div>
    </div>
  );

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold uppercase tracking-wider text-sm">Analyses Joueurs IA</h3>
            <p className="text-[10px] text-muted-foreground">L'agent IA prépare vos combinés...</p>
          </div>
        </div>
        <Button onClick={fetchPlayerSuggestions} disabled={isLoading} size="sm" variant="ghost">
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-success flex items-center gap-1 uppercase">
                <Shield className="w-3 h-3" /> Top Safe
              </p>
              {players
                .filter((p) => p.category === "SAFE")
                .slice(0, 3)
                .map((p) => renderPlayerCard(p, "border-success/20"))}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-warning flex items-center gap-1 uppercase">
                <Zap className="w-3 h-3" /> Top Fun
              </p>
              {players
                .filter((p) => p.category === "FUN")
                .slice(0, 3)
                .map((p) => renderPlayerCard(p, "border-warning/20"))}
            </div>
          </div>

          {/* SECTION MEGA FUN AUTOMATISÉE */}
          <div className="border-t border-purple-500/20 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-5 h-5 text-purple-500 animate-pulse" />
              <span className="text-sm font-black bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent uppercase italic">
                Vibration Mega Fun de l'Agent IA
              </span>
            </div>

            <div className="p-4 rounded-xl border-2 border-purple-500/40 bg-gradient-to-br from-purple-950/30 to-black text-white relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
                <Sparkles className="w-16 h-16 text-purple-500" />
              </div>

              <div className="grid grid-cols-1 gap-2 mb-5">
                {megaFunIA.map((p, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-[11px] bg-white/5 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-purple-500 font-black font-mono">#{i + 1}</span>
                      <span className="font-medium">
                        {p.name} <span className="text-gray-500 text-[9px]">({p.team})</span>
                      </span>
                    </div>
                    <Badge className="bg-purple-900/50 text-purple-300 border-purple-500/30 text-[9px] h-5">
                      {p.suggestedType}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="bg-black/40 p-4 rounded-lg border border-purple-500/20">
                <p className="text-[10px] text-center text-purple-300 uppercase mb-3 font-bold tracking-widest">
                  Cote totale du bookmaker
                </p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold">@</span>
                    <Input
                      type="number"
                      placeholder="Ex: 11000"
                      value={megaOdds}
                      onChange={(e) => setMegaOdds(e.target.value)}
                      className="pl-8 bg-black/60 border-purple-500/40 text-purple-300 font-black text-lg h-12"
                    />
                  </div>
                  <Button
                    onClick={handlePlaceMegaFun}
                    disabled={isPlacing === "mega" || !megaOdds}
                    className="h-12 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold shadow-lg shadow-purple-900/20"
                  >
                    {isPlacing === "mega" ? (
                      <RefreshCw className="animate-spin" />
                    ) : (
                      <Trophy className="w-5 h-5 mr-2" />
                    )}
                    PLACER
                  </Button>
                </div>
                {megaOdds && (
                  <p className="text-center text-[10px] text-green-400 mt-3 font-mono animate-pulse">
                    Gain potentiel pour 10€ : {(parseFloat(megaOdds) * 10).toLocaleString()}€
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// Mappings d'équipes (simplifié pour le rendu)
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
