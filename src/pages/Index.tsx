import { useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { UpcomingMatches } from "@/components/dashboard/UpcomingMatches";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { LearningPanel } from "@/components/dashboard/LearningPanel";
import { HotPlayers } from "@/components/dashboard/HotPlayers";
import { ValueAlerts } from "@/components/dashboard/ValueAlerts";
import { Match, BadgeType, PredictionStats } from "@/types/nhl";
import { Users, Target, TrendingUp, Zap } from "lucide-react";

// Mock data - sera remplacé par les vraies données Supabase
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
  {
    id: "4",
    homeTeam: {
      abbr: "EDM",
      name: "Oilers",
      isBackToBack: true,
      pimPerGame: 7.8,
      recentForm: { wins: 2, losses: 3, otLosses: 0 },
    },
    awayTeam: {
      abbr: "LAK",
      name: "Kings",
      isBackToBack: false,
      pimPerGame: 6.5,
      recentForm: { wins: 3, losses: 1, otLosses: 1 },
    },
    startTime: new Date(Date.now() + 7 * 60 * 60 * 1000),
    status: "scheduled",
  },
];

const mockMatchBadges: Record<string, { home: BadgeType[]; away: BadgeType[] }> = {
  "1": { home: ["fire"], away: ["btb", "discipline"] },
  "2": { home: [], away: ["fire"] },
  "3": { home: ["fire"], away: ["pp"] },
  "4": { home: ["btb"], away: [] },
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

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync] = useState(new Date());

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1500);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-30 pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-radial from-primary/5 to-transparent blur-3xl pointer-events-none" />
      
      <Header lastSync={lastSync} onRefresh={handleRefresh} isLoading={isLoading} />
      
      <main className="container mx-auto px-4 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            title="Matchs ce soir"
            value={mockMatches.length}
            icon={Target}
            variant="info"
          />
          <StatsCard
            title="Alertes Actives"
            value={mockValueAlerts.length}
            icon={Zap}
            variant="warning"
          />
          <StatsCard
            title="Win Rate"
            value={`${Math.round(mockPredictionStats.winRate * 100)}%`}
            icon={TrendingUp}
            trend={{ value: 5.2, isPositive: true }}
            variant="success"
          />
          <StatsCard
            title="Joueurs Suivis"
            value={mockHotPlayers.length}
            icon={Users}
          />
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Matches */}
          <div className="lg:col-span-2 space-y-6">
            <UpcomingMatches matches={mockMatches} matchBadges={mockMatchBadges} />
            
            {/* Value Alerts */}
            <ValueAlerts alerts={mockValueAlerts} />
          </div>

          {/* Right Column - Stats & Learning */}
          <div className="space-y-6">
            <HotPlayers players={mockHotPlayers} />
            <LearningPanel stats={mockPredictionStats} />
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
      </main>
    </div>
  );
};

export default Index;
