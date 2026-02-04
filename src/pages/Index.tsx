import { useState, useEffect } from "react";
import { Header } from "@/components/dashboard/Header";
import { UpcomingMatches } from "@/components/dashboard/UpcomingMatches";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { LearningPanel } from "@/components/dashboard/LearningPanel";
import { HotPlayers } from "@/components/dashboard/HotPlayers";
import { ValueAlerts } from "@/components/dashboard/ValueAlerts";
import { NightAnalysis } from "@/components/dashboard/NightAnalysis";
import { SystemStatus } from "@/components/dashboard/SystemStatus";
import { AIPicksPanel } from "@/components/dashboard/AIPicksPanel";
import { StrategicBettingPanel } from "@/components/dashboard/StrategicBettingPanel";
import { BankrollPanel } from "@/components/dashboard/BankrollPanel";
import { Match, BadgeType, PredictionStats } from "@/types/nhl";
import { useNHLData } from "@/hooks/useNHLData";
import { Users, Target, TrendingUp, Zap, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
// Convert API response to app types
function convertGamesToMatches(games: any[]): Match[] {
  return games.map(game => ({
    id: game.id?.toString() || Math.random().toString(),
    homeTeam: {
      abbr: game.homeTeam.abbr,
      name: game.homeTeam.name,
      isBackToBack: game.homeTeam.isB2B,
      pimPerGame: game.homeTeam.pimPerGame,
      recentForm: { wins: 0, losses: 0, otLosses: 0 }, // Would need additional API call
    },
    awayTeam: {
      abbr: game.awayTeam.abbr,
      name: game.awayTeam.name,
      isBackToBack: game.awayTeam.isB2B,
      pimPerGame: game.awayTeam.pimPerGame,
      recentForm: { wins: 0, losses: 0, otLosses: 0 },
    },
    startTime: new Date(game.startTime),
    venue: game.venue,
    status: game.status,
  }));
}

function convertBadges(games: any[]): Record<string, { home: BadgeType[]; away: BadgeType[] }> {
  const badges: Record<string, { home: BadgeType[]; away: BadgeType[] }> = {};
  
  for (const game of games) {
    const id = game.id?.toString() || Math.random().toString();
    badges[id] = {
      home: (game.badges?.home || []) as BadgeType[],
      away: (game.badges?.away || []) as BadgeType[],
    };
  }
  
  return badges;
}

// Mock value alerts - will be calculated from real data
const generateValueAlerts = (hotPlayers: any[], games: any[]) => {
  return hotPlayers.slice(0, 3).map((player, index) => ({
    id: `alert-${index}`,
    playerName: player.name,
    team: player.team,
    marketType: "Goal Scorer",
    currentOdds: player.currentOdds || 2.0 + Math.random(),
    reason: player.ppGoals > 0 
      ? `${player.ppGoals} buts en PP récemment` 
      : `${player.goals} buts en 5 matchs`,
    confidence: (player.goals >= 3 ? 'high' : player.goals >= 2 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    matchTime: new Date(Date.now() + (index + 1) * 2 * 60 * 60 * 1000),
  }));
};

const Index = () => {
  const { toast } = useToast();
  const { 
    games, 
    topMatches,
    hotPlayers, 
    stats, 
    cronJobs,
    lastStatsSync,
    lastOddsSync,
    lastSync, 
    isLoading, 
    isRefreshing, 
    refresh 
  } = useNHLData();

  const [localMatches, setLocalMatches] = useState<Match[]>([]);
  const [localBadges, setLocalBadges] = useState<Record<string, { home: BadgeType[]; away: BadgeType[] }>>({});
  const [valueAlerts, setValueAlerts] = useState<any[]>([]);
  const [analyzedMatches, setAnalyzedMatches] = useState<any[]>([]);

  // Update local state when data changes
  useEffect(() => {
    if (games.length > 0) {
      setLocalMatches(convertGamesToMatches(games));
      setLocalBadges(convertBadges(games));
    }
  }, [games]);

  useEffect(() => {
    if (hotPlayers.length > 0) {
      setValueAlerts(generateValueAlerts(hotPlayers, games));
    }
  }, [hotPlayers, games]);

  // Convert top matches for NightAnalysis component
  useEffect(() => {
    if (topMatches.length > 0) {
      const converted = topMatches.map(m => ({
        id: m.id?.toString() || Math.random().toString(),
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        startTime: new Date(m.startTime),
        advantageScore: m.advantageScore,
        advantageTeam: m.advantageTeam,
        reasons: m.reasons,
      }));
      setAnalyzedMatches(converted);
    }
  }, [topMatches]);

  const handleRefresh = async () => {
    try {
      await refresh();
      toast({
        title: "Données synchronisées",
        description: "Les stats NHL et cotes ont été mises à jour.",
      });
    } catch {
      toast({
        title: "Erreur de synchronisation",
        description: "Impossible de récupérer les dernières données.",
        variant: "destructive",
      });
    }
  };

  // Format hot players for component
  const formattedHotPlayers = hotPlayers.map(p => ({
    name: p.name,
    team: p.team,
    goalsLast5: p.goals,
    pointsLast5: p.goals + (p.goals * 0.5), // Simplified - would need real assist data
    ppGoals: p.ppGoals,
    currentOdds: p.currentOdds,
    duoPartner: p.duo?.split('+')[1],
  }));

  // Format prediction stats
  const predictionStats: PredictionStats = {
    totalPredictions: stats.totalPredictions,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.winRate,
    roi: stats.roi,
  };

  // Use mock data if no real data
  const displayMatches = localMatches.length > 0 ? localMatches : mockMatches;
  const displayBadges = Object.keys(localBadges).length > 0 ? localBadges : mockMatchBadges;
  const displayHotPlayers = formattedHotPlayers.length > 0 ? formattedHotPlayers : mockHotPlayers;
  const displayStats = predictionStats; // Toujours les vraies stats, pas de mock
  const displayAlerts = valueAlerts.length > 0 ? valueAlerts : mockValueAlerts;
  const displayAnalyzedMatches = analyzedMatches.length > 0 ? analyzedMatches : mockAnalyzedMatches;
  
  // Format cron jobs for display
  const displayCronJobs = cronJobs.length > 0 ? cronJobs.map(job => ({
    name: job.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    schedule: job.schedule,
    lastRun: job.lastRun ? new Date(job.lastRun) : null,
    isActive: job.isActive,
  })) : mockCronJobs;

  return (
    <div className="min-h-screen bg-background">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-30 pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-radial from-primary/5 to-transparent blur-3xl pointer-events-none" />
      
      <Header 
        lastSync={lastSync || new Date()} 
        onRefresh={handleRefresh} 
        isLoading={isLoading || isRefreshing} 
      />
      
      <main className="container mx-auto px-4 py-6">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Chargement des données...</span>
          </div>
        )}

        {!isLoading && (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatsCard
                title="Matchs ce soir"
                value={displayMatches.length}
                icon={Target}
                variant="info"
              />
              <StatsCard
                title="Alertes Actives"
                value={displayAlerts.length}
                icon={Zap}
                variant="warning"
              />
              <StatsCard
                title="Win Rate"
                value={`${Math.round(displayStats.winRate * 100)}%`}
                icon={TrendingUp}
                trend={{ value: 5.2, isPositive: true }}
                variant="success"
              />
              <StatsCard
                title="Joueurs Suivis"
                value={displayHotPlayers.length}
                icon={Users}
              />
            </div>

            {/* Bankroll & Learning - Side by Side */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              <BankrollPanel />
              <LearningPanel stats={displayStats} />
            </div>

            {/* AI Panels - Full Width */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              <AIPicksPanel />
              <StrategicBettingPanel />
            </div>

            {/* Main Grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Left Column - Matches */}
              <div className="lg:col-span-2 space-y-6">
                {/* Night Analysis - Top 3 matches */}
                <NightAnalysis matches={displayAnalyzedMatches} />
                
                <UpcomingMatches matches={displayMatches} matchBadges={displayBadges} />
                
                {/* Value Alerts */}
                <ValueAlerts alerts={displayAlerts} />
              </div>

              {/* Right Column - Stats & Players */}
              <div className="space-y-6">
                <HotPlayers players={displayHotPlayers} />
                <SystemStatus 
                  cronJobs={displayCronJobs}
                  lastStatsSync={lastStatsSync}
                  lastOddsSync={lastOddsSync}
                  isLoading={isRefreshing}
                />
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-12 py-6 border-t border-border">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>NHL Smart Predictor Pro</span>
                  <span className="text-primary">•</span>
                  <span>Powered by Lovable Cloud</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Données: NHL API • Winamax</span>
                  <span>Timezone: Paris (CET)</span>
                </div>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
};

// Mock data fallback
const mockMatches: Match[] = [
  {
    id: "1",
    homeTeam: {
      abbr: "TOR",
      name: "Maple Leafs",
      isBackToBack: false,
      pimPerGame: 7.2,
      recentForm: { wins: 3, losses: 1, otLosses: 1 },
    },
    awayTeam: {
      abbr: "MTL",
      name: "Canadiens",
      isBackToBack: true,
      pimPerGame: 9.4,
      recentForm: { wins: 2, losses: 2, otLosses: 1 },
    },
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    status: "scheduled",
  },
  {
    id: "2",
    homeTeam: {
      abbr: "VGK",
      name: "Golden Knights",
      isBackToBack: false,
      pimPerGame: 6.8,
      recentForm: { wins: 4, losses: 1, otLosses: 0 },
    },
    awayTeam: {
      abbr: "COL",
      name: "Avalanche",
      isBackToBack: false,
      pimPerGame: 7.5,
      recentForm: { wins: 3, losses: 2, otLosses: 0 },
    },
    startTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
    status: "scheduled",
  },
  {
    id: "3",
    homeTeam: {
      abbr: "NYR",
      name: "Rangers",
      isBackToBack: false,
      pimPerGame: 6.2,
      recentForm: { wins: 4, losses: 0, otLosses: 1 },
    },
    awayTeam: {
      abbr: "BOS",
      name: "Bruins",
      isBackToBack: false,
      pimPerGame: 8.1,
      recentForm: { wins: 3, losses: 2, otLosses: 0 },
    },
    startTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
    status: "scheduled",
  },
];

const mockMatchBadges: Record<string, { home: BadgeType[]; away: BadgeType[] }> = {
  "1": { home: ["fire"], away: ["btb", "discipline"] },
  "2": { home: [], away: ["fire"] },
  "3": { home: ["fire"], away: ["pp"] },
};

const mockPredictionStats: PredictionStats = {
  totalPredictions: 147,
  wins: 98,
  losses: 49,
  winRate: 0.667,
  roi: 12.4,
};

const mockHotPlayers = [
  { name: "Connor McDavid", team: "EDM", goalsLast5: 4, pointsLast5: 9, ppGoals: 2, currentOdds: 1.85, duoPartner: "Draisaitl" },
  { name: "Leon Draisaitl", team: "EDM", goalsLast5: 3, pointsLast5: 8, ppGoals: 2, currentOdds: 2.10 },
  { name: "Auston Matthews", team: "TOR", goalsLast5: 5, pointsLast5: 7, ppGoals: 1, currentOdds: 1.95, duoPartner: "Marner" },
  { name: "Nathan MacKinnon", team: "COL", goalsLast5: 3, pointsLast5: 10, ppGoals: 1, currentOdds: 2.25 },
  { name: "Nikita Kucherov", team: "TBL", goalsLast5: 2, pointsLast5: 8, ppGoals: 0, currentOdds: 2.50 },
];

const mockAnalyzedMatches = [
  {
    id: "analysis-1",
    homeTeam: { abbr: "TOR", name: "Maple Leafs", isB2B: false, pimPerGame: 7.2 },
    awayTeam: { abbr: "MTL", name: "Canadiens", isB2B: true, pimPerGame: 9.4 },
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    advantageScore: 22,
    advantageTeam: 'home' as const,
    reasons: ["Adversaire en B2B 🔋", "PIM adversaire: 9.4/G 🔴"],
  },
  {
    id: "analysis-2",
    homeTeam: { abbr: "EDM", name: "Oilers", isB2B: false, pimPerGame: 6.5 },
    awayTeam: { abbr: "LAK", name: "Kings", isB2B: false, pimPerGame: 13.4 },
    startTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
    advantageScore: 15,
    advantageTeam: 'home' as const,
    reasons: ["PIM adversaire: 13.4/G 🔴"],
  },
  {
    id: "analysis-3",
    homeTeam: { abbr: "NYR", name: "Rangers", isB2B: false, pimPerGame: 6.2 },
    awayTeam: { abbr: "BOS", name: "Bruins", isB2B: true, pimPerGame: 13.2 },
    startTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
    advantageScore: 25,
    advantageTeam: 'home' as const,
    reasons: ["Adversaire en B2B 🔋", "PIM adversaire: 13.2/G 🔴"],
  },
];

const mockValueAlerts = [
  {
    id: "1",
    playerName: "Leon Draisaitl",
    team: "EDM",
    marketType: "Goal Scorer",
    currentOdds: 2.10,
    reason: "PP Opportunity - LAK a +8.5 PIM/G",
    confidence: "high" as const,
    matchTime: new Date(Date.now() + 7 * 60 * 60 * 1000),
  },
  {
    id: "2",
    playerName: "Auston Matthews",
    team: "TOR",
    marketType: "Goal Scorer",
    currentOdds: 1.95,
    reason: "5 buts en 5 matchs + MTL en B2B",
    confidence: "high" as const,
    matchTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
  },
  {
    id: "3",
    playerName: "Nathan MacKinnon",
    team: "COL",
    marketType: "Player Points",
    currentOdds: 1.45,
    reason: "10 pts en 5 matchs, forme exceptionnelle",
    confidence: "medium" as const,
    matchTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
  },
];

const mockCronJobs = [
  { name: "Sync NHL Stats", schedule: "08:30 UTC", lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000), isActive: true },
  { name: "Sync Winamax Odds", schedule: "18:00 UTC", lastRun: new Date(Date.now() - 5 * 60 * 60 * 1000), isActive: true },
  { name: "Validate Predictions", schedule: "08:30 UTC", lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000), isActive: true },
];

export default Index;
