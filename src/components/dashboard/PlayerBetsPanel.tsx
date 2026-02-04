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
  Flame, // Ajout de l'icône Flame
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
  manualOdds?: number;
}

interface SuperComboPlayer {
  selections: (PlayerSuggestion & { odds: number; betType: string })[];
  systemType: string;
  combinationsCount: number;
  stakePerCombo: number;
  potentialGain: { min: number; max: number };
  minRecoveryPercent: number;
}

function combinations(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

export function PlayerBetsPanel() {
  const { addBet, isUpdating } = useBankroll();

  const [players, setPlayers] = useState<PlayerSuggestion[]>([]);
  const [oddsInputs, setOddsInputs] = useState<Record<string, { odds: string; betType: "Buteur" | "Point" }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stakePerCombo, setStakePerCombo] = useState(0.25);
  const [isPlacing, setIsPlacing] = useState<string | null>(null);

  const fetchPlayerSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: metrics } = await supabase.from("learning_metrics").select("*").eq("metric_type", "player");
      const boosts = new Map<string, number>();
      metrics?.forEach((m) => boosts.set(m.metric_key.toLowerCase(), m.confidence_adjustment || 0));

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: recentGoals, error: goalsError } = await supabase
        .from("player_stats")
        .select("*")
        .gte("game_date", fourteenDaysAgo.toISOString().split("T")[0])
        .order("game_date", { ascending: false });

      if (goalsError) throw goalsError;

      const { data: teamMeta } = await supabase.from("team_meta").select("*");
      const teamMetaMap = new Map(teamMeta?.map((t) => [t.team_abbr, t]) || []);

      const { data: tonightOdds } = await supabase
        .from("winamax_odds")
        .select("*")
        .eq("market_type", "h2h")
        .gte("commence_time", new Date().toISOString())
        .order("commence_time", { ascending: true })
        .limit(20);

      const tonightTeams = new Set<string>();
      const tonightMatches: Record<string, { match: string; time: string }> = {};

      (tonightOdds || []).forEach((o) => {
        const teams = extractTeamsFromMatch(o.match_name);
        teams.forEach((t) => {
          tonightTeams.add(t);
          tonightMatches[t] = { match: o.match_name, time: o.commence_time };
        });
      });

      const playerStatsMap = new Map<string, { goals: number; ppGoals: number; team: string; games: Set<string> }>();
      (recentGoals || []).forEach((g) => {
        const key = g.scorer;
        const existing = playerStatsMap.get(key) || { goals: 0, ppGoals: 0, team: g.team_abbr, games: new Set() };
        existing.goals++;
        if (g.situation === "PP") existing.ppGoals++;
        existing.games.add(g.game_date);
        playerStatsMap.set(key, existing);
      });

      const normalizedPlayers = new Map<string, { goals: number; ppGoals: number; team: string; games: Set<string> }>();
      playerStatsMap.forEach((playerStats, playerName) => {
        const abbreviated = playerName.match(/^[A-Z]\.\s+(.+)$/);
        if (abbreviated) {
          const lastName = abbreviated[1];
          let foundFull = false;
          playerStatsMap.forEach((_, fullName) => {
            if (fullName !== playerName && fullName.endsWith(lastName) && !fullName.match(/^[A-Z]\.\s/)) {
              const existing = normalizedPlayers.get(fullName);
              if (existing) {
                existing.goals += playerStats.goals;
                existing.ppGoals += playerStats.ppGoals;
                playerStats.games.forEach((g) => existing.games.add(g));
              }
              foundFull = true;
            }
          });
          if (!foundFull) normalizedPlayers.set(playerName, { ...playerStats, games: new Set(playerStats.games) });
        } else {
          const existing = normalizedPlayers.get(playerName);
          if (existing) {
            existing.goals += playerStats.goals;
            existing.ppGoals += playerStats.ppGoals;
            playerStats.games.forEach((g) => existing.games.add(g));
          } else {
            normalizedPlayers.set(playerName, { ...playerStats, games: new Set(playerStats.games) });
          }
        }
      });

      const suggestions: PlayerSuggestion[] = [];
      normalizedPlayers.forEach((stats, playerName) => {
        if (!tonightTeams.has(stats.team)) return;
        const matchInfo = tonightMatches[stats.team];
        if (!matchInfo) return;
        const opponentAbbr = getOpponentAbbr(matchInfo.match, stats.team);
        const opponentMeta = teamMetaMap.get(opponentAbbr);
        const playerBoost = boosts.get(playerName.toLowerCase()) || 0;
        let confidence = 50 + playerBoost;
        const reasons: string[] = [];

        if (stats.goals >= 4) {
          confidence += 25;
          reasons.push(`🔥 ${stats.goals} buts`);
        } else if (stats.goals >= 2) {
          confidence += 15;
          reasons.push(`${stats.goals} buts`);
        }
        if (stats.ppGoals >= 2 && opponentMeta?.pim_per_game && opponentMeta.pim_per_game >= 8) {
          confidence += 20;
          reasons.push(`PP opp: ${opponentMeta.pim_per_game.toFixed(1)} PIM/G`);
        } else if (stats.ppGoals >= 1) {
          confidence += 10;
          reasons.push(`${stats.ppGoals} PP`);
        }
        if (opponentMeta?.is_b2b) {
          confidence += 15;
          reasons.push("Adv. B2B 🔋");
        }
        if (playerBoost > 0) reasons.push(`📈 +${playerBoost}%`);
        else if (playerBoost < 0) reasons.push(`📉 ${playerBoost}%`);
        confidence = Math.min(confidence, 95);

        suggestions.push({
          id: `player-${playerName.replace(/\s+/g, "-").toLowerCase()}`,
          name: playerName,
          team: stats.team,
          match: matchInfo.match,
          matchTime: matchInfo.time,
          goalsLast14: stats.goals,
          ppGoals: stats.ppGoals,
          confidence,
          reasoning: reasons.join(" • ") || "Actif récemment",
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

      setPlayers(suggestions.slice(0, 12));
      toast.success("Suggestions joueurs mises à jour");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerSuggestions();
  }, []);

  const safePlayers = players.filter((p) => p.category === "SAFE").slice(0, 3);
  const funPlayers = players.filter((p) => p.category === "FUN").slice(0, 3);

  const playersWithOdds = useMemo(() => {
    return players
      .map((p) => {
        const input = oddsInputs[p.id];
        if (!input || !input.odds) return null;
        const odds = parseFloat(input.odds);
        if (isNaN(odds) || odds <= 1) return null;
        return { ...p, odds, betType: input.betType };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [players, oddsInputs]);

  const superCombo = useMemo<SuperComboPlayer | null>(() => {
    if (playersWithOdds.length < 2) return null;
    const selections = playersWithOdds.slice(0, 6);
    const total = selections.length;
    const required = total <= 3 ? Math.max(2, total - 1) : Math.max(3, total - 1);
    const systemType = `${required}/${total}`;
    const combosCount = combinations(total, required);
    const stake = stakePerCombo;
    const allOdds = selections.map((s) => s.odds);
    const sortedOdds = [...allOdds].sort((a, b) => a - b);
    const minComboOdds = sortedOdds.slice(0, required).reduce((acc, o) => acc * o, 1);
    const minGain = stake * minComboOdds;
    const generateCombos = (arr: number[], k: number): number[][] => {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [first, ...rest] = arr;
      const withFirst = generateCombos(rest, k - 1).map((c) => [first, ...c]);
      const withoutFirst = generateCombos(rest, k);
      return [...withFirst, ...withoutFirst];
    };
    const allCombos = generateCombos(allOdds, required);
    const maxGain = allCombos.reduce((sum, c) => sum + stake * c.reduce((acc, o) => acc * o, 1), 0);
    return {
      selections,
      systemType,
      combinationsCount: combosCount,
      stakePerCombo: stake,
      potentialGain: { min: parseFloat(minGain.toFixed(2)), max: parseFloat(maxGain.toFixed(2)) },
      minRecoveryPercent: Math.round((minGain / (stake * combosCount)) * 100),
    };
  }, [playersWithOdds, stakePerCombo]);

  const handleOddsChange = (playerId: string, field: "odds" | "betType", value: string) => {
    setOddsInputs((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        odds: prev[playerId]?.odds || "",
        betType: prev[playerId]?.betType || "Buteur",
        [field]: value,
      },
    }));
  };

  const handlePlaceBet = async (player: PlayerSuggestion) => {
    const input = oddsInputs[player.id];
    const odds = parseFloat(input?.odds || "0");
    if (!input?.odds || isNaN(odds) || odds <= 1) {
      toast.error("Cote invalide");
      return;
    }
    setIsPlacing(player.id);
    try {
      addBet({
        bet_date: new Date().toISOString().split("T")[0],
        match_name: player.match,
        bet_type: input.betType === "Point" ? "PLAYER_POINT" : "PLAYER_GOAL",
        selection: `${player.name} - ${input.betType}`,
        odds,
        stake: 1,
        potential_gain: odds,
        outcome: "pending",
        actual_gain: 0,
        source: "player_pillar",
        notes: `[${player.category}] ${player.reasoning}`,
      });
      toast.success(`${player.name} placé !`);
    } catch (err) {
      toast.error("Erreur");
    } finally {
      setIsPlacing(null);
    }
  };

  const handlePlaceSuperCombo = async () => {
    if (!superCombo) return;
    setIsPlacing("super");
    try {
      addBet({
        bet_date: new Date().toISOString().split("T")[0],
        match_name: superCombo.selections
          .map((s) => s.match)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(" | "),
        bet_type: `SYSTEM_${superCombo.systemType.replace("/", "_")}`,
        selection: superCombo.selections.map((s) => `${s.name} (${s.betType})`).join(" + "),
        odds: superCombo.selections.reduce((acc, s) => acc * s.odds, 1),
        stake: superCombo.stakePerCombo * superCombo.combinationsCount,
        potential_gain: superCombo.potentialGain.max,
        outcome: "pending",
        actual_gain: 0,
        source: "player_super_combo",
        notes: `Système ${superCombo.systemType}`,
      });
      toast.success("Super Combo placé !");
    } catch (err) {
      toast.error("Erreur");
    } finally {
      setIsPlacing(null);
    }
  };

  const renderPlayerCard = (player: PlayerSuggestion, colorClass: string) => {
    const input = oddsInputs[player.id] || { odds: "", betType: "Buteur" as const };
    const hasValidOdds = input.odds && parseFloat(input.odds) > 1;
    return (
      <div key={player.id} className={`p-3 rounded-lg border ${colorClass} bg-card/50`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{player.name}</p>
              <Badge variant="outline" className="text-xs">
                {player.team}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{player.match}</p>
          </div>
          <div className="text-right">
            <div
              className={`font-bold ${player.confidence >= 80 ? "text-success" : player.confidence >= 60 ? "text-warning" : "text-muted-foreground"}`}
            >
              {player.confidence}%
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(player.matchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
          <span>
            <Target className="w-3 h-3 inline mr-1" />
            {player.goalsLast14} buts
          </span>
          {player.ppGoals > 0 && (
            <span>
              <Zap className="w-3 h-3 inline mr-1" />
              {player.ppGoals} PP
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">{player.reasoning}</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input
              type="number"
              step="0.01"
              placeholder="Cote"
              value={input.odds}
              onChange={(e) => handleOddsChange(player.id, "odds", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <select
            value={input.betType}
            onChange={(e) => handleOddsChange(player.id, "betType", e.target.value as any)}
            className="h-8 rounded-md border text-xs px-2 bg-background"
          >
            <option value="Buteur">Buteur</option>
            <option value="Point">Point</option>
          </select>
          <Button
            size="sm"
            variant={hasValidOdds ? "default" : "outline"}
            className="h-8 px-3"
            disabled={!hasValidOdds || isPlacing === player.id || isUpdating}
            onClick={() => handlePlaceBet(player)}
          >
            <DollarSign className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">
              Paris JOUEURS <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">IA + Manuel</Badge>
            </h3>
            <p className="text-xs text-muted-foreground italic text-purple-400">Section Mega Fun incluse 🚀</p>
          </div>
        </div>
        <Button onClick={fetchPlayerSuggestions} disabled={isLoading} size="sm" variant="outline">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
      ) : (
        <div className="space-y-4">
          {/* SAFE Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-success" /> <span className="text-sm font-medium uppercase">Safe</span>
            </div>
            <div className="grid gap-2">
              {safePlayers.length > 0 ? (
                safePlayers.map((p) => renderPlayerCard(p, "border-success/30"))
              ) : (
                <p className="text-xs text-center py-2 text-muted-foreground">Rien ce soir</p>
              )}
            </div>
          </div>

          {/* FUN Section */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-warning" /> <span className="text-sm font-medium uppercase">Fun</span>
            </div>
            <div className="grid gap-2">
              {funPlayers.length > 0 ? (
                funPlayers.map((p) => renderPlayerCard(p, "border-warning/30"))
              ) : (
                <p className="text-xs text-center py-2 text-muted-foreground">Rien ce soir</p>
              )}
            </div>
          </div>

          {/* Super Combo Section */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium uppercase text-accent">Super Combo</span>
              <Badge variant="secondary" className="text-[10px]">
                {playersWithOdds.length}/4
              </Badge>
            </div>

            {playersWithOdds.length < 4 ? (
              <div className="p-4 rounded-lg border border-dashed border-accent/30 bg-accent/5 text-center">
                <Calculator className="w-8 h-8 mx-auto mb-2 text-accent/50 opacity-50" />
                <p className="text-xs text-muted-foreground">Saisissez 4 cotes pour le système sécurisé.</p>
              </div>
            ) : (
              superCombo && (
                <div className="p-4 rounded-lg border-2 border-accent/30 bg-accent/5 space-y-4">
                  <div className="flex justify-between items-center">
                    <Badge className="bg-accent text-accent-foreground text-[10px]">
                      Système {superCombo.systemType}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {superCombo.combinationsCount} combinés
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {superCombo.selections.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {s.name} @{s.odds}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 border-y border-accent/20 py-2">
                    <Input
                      type="number"
                      step="0.05"
                      value={stakePerCombo}
                      onChange={(e) => setStakePerCombo(parseFloat(e.target.value) || 0.25)}
                      className="h-7 w-16 text-xs font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      par combo = {(stakePerCombo * superCombo.combinationsCount).toFixed(2)}€
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
                    <div className="p-1 bg-background/50 rounded">
                      Min: <span className="text-success font-bold">{superCombo.potentialGain.min}€</span>
                    </div>
                    <div className="p-1 bg-background/50 rounded">
                      Max: <span className="text-accent font-bold">{superCombo.potentialGain.max}€</span>
                    </div>
                  </div>
                  <Button
                    className="w-full h-8 text-xs gap-2"
                    variant="accent"
                    onClick={handlePlaceSuperCombo}
                    disabled={isPlacing === "super"}
                  >
                    <Trophy className="w-3 h-3" /> Placer le Système
                  </Button>
                </div>
              )
            )}
          </div>

          {/* MEGA FUN Section (Positionnée CORRECTEMENT à l'extérieur) */}
          <div className="border-t border-purple-500/20 pt-6 mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-purple-500 animate-bounce" />
              <span className="text-sm font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent italic">
                VIBRATION MEGA FUN (COTE 11k+)
              </span>
              <Badge className="bg-purple-500/20 text-purple-400 border-none text-[9px] animate-pulse uppercase">
                Folie Pure
              </Badge>
            </div>

            {playersWithOdds.length < 5 ? (
              <div className="p-4 rounded-lg border border-dashed border-purple-500/30 bg-purple-500/5 text-center">
                <Flame className="w-8 h-8 mx-auto mb-2 text-purple-500/30" />
                <p className="text-[11px] text-muted-foreground italic">
                  Saisissez au moins <strong>5 joueurs</strong> pour débloquer le multiplicateur géant.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-lg border-2 border-purple-500/50 bg-gradient-to-br from-purple-950/40 to-black text-white overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
                  <Sparkles className="w-12 h-12 text-purple-500" />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-purple-600 text-[10px] text-white uppercase border-none">
                    Combiné Sec (Tout ou rien)
                  </Badge>
                </div>
                <div className="space-y-1 mb-4">
                  {playersWithOdds.slice(0, 8).map((s, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center text-[10px] bg-white/5 p-1 px-2 rounded border border-white/5"
                    >
                      <span>
                        {s.name} <span className="text-purple-300/50">({s.betType})</span>
                      </span>
                      <span className="font-bold text-purple-400">@{s.odds.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-white/10">
                  <div>
                    <p className="text-[9px] text-gray-500 uppercase">Cote Totale</p>
                    <p className="text-xl font-black text-purple-400">
                      ~
                      {playersWithOdds
                        .slice(0, 8)
                        .reduce((acc, p) => acc * p.odds, 1)
                        .toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-gray-500 uppercase">Pour 10€</p>
                    <p className="text-lg font-black text-green-400">
                      +
                      {(playersWithOdds.slice(0, 8).reduce((acc, p) => acc * p.odds, 1) * 10).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 },
                      )}
                      €
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// Helpers
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

function getOpponentAbbr(matchName: string, teamAbbr: string): string {
  const teams = extractTeamsFromMatch(matchName);
  return teams.find((t) => t !== teamAbbr) || "UNK";
}
