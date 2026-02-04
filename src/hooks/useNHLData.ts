import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Game {
  id: string;
  startTime: string;
  venue?: string;
  status: 'scheduled' | 'live' | 'final';
  homeTeam: {
    abbr: string;
    name: string;
    isB2B: boolean;
    pimPerGame: number;
  };
  awayTeam: {
    abbr: string;
    name: string;
    isB2B: boolean;
    pimPerGame: number;
  };
  badges: {
    home: string[];
    away: string[];
  };
}

interface HotPlayer {
  name: string;
  team: string;
  goals: number;
  ppGoals: number;
  duo?: string;
  currentOdds?: number;
}

interface PredictionStats {
  totalPredictions: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
}

interface CronJob {
  name: string;
  schedule: string;
  lastRun: string | null;
  isActive: boolean;
}

interface TopMatch {
  id: string;
  startTime: string;
  homeTeam: {
    abbr: string;
    name: string;
    isB2B: boolean;
    pimPerGame: number;
  };
  awayTeam: {
    abbr: string;
    name: string;
    isB2B: boolean;
    pimPerGame: number;
  };
  advantageScore: number;
  advantageTeam: 'home' | 'away';
  reasons: string[];
}

interface GamesResponse {
  success: boolean;
  timestamp: string;
  timezone: string;
  games: Game[];
  topMatches: TopMatch[];
  hotPlayers: HotPlayer[];
  stats: PredictionStats;
  cronJobs?: CronJob[];
  lastStatsSync?: string;
  lastOddsSync?: string;
}

export function useNHLData() {
  const queryClient = useQueryClient();

  // Fetch games and dashboard data
  const gamesQuery = useQuery({
    queryKey: ['nhl-games'],
    queryFn: async (): Promise<GamesResponse> => {
      const { data, error } = await supabase.functions.invoke('get-games');
      
      if (error) {
        console.error('Error fetching games:', error);
        throw error;
      }
      
      return data;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });

  // Sync NHL stats mutation
  const syncStatsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-nhl-stats');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nhl-games'] });
    },
  });

  // Sync Winamax odds mutation
  const syncOddsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-winamax-odds');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nhl-games'] });
    },
  });

  // Validate predictions mutation
  const validatePredictionsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('validate-predictions');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nhl-games'] });
    },
  });

  // Full refresh - runs all sync operations
  const refreshAll = async () => {
    try {
      await Promise.all([
        syncStatsMutation.mutateAsync(),
        syncOddsMutation.mutateAsync(),
      ]);
      await gamesQuery.refetch();
    } catch (error) {
      console.error('Error refreshing data:', error);
      throw error;
    }
  };

  return {
    // Data
    games: gamesQuery.data?.games || [],
    topMatches: gamesQuery.data?.topMatches || [],
    hotPlayers: gamesQuery.data?.hotPlayers || [],
    stats: gamesQuery.data?.stats || {
      totalPredictions: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      roi: 0,
    },
    cronJobs: gamesQuery.data?.cronJobs || [],
    lastStatsSync: gamesQuery.data?.lastStatsSync ? new Date(gamesQuery.data.lastStatsSync) : null,
    lastOddsSync: gamesQuery.data?.lastOddsSync ? new Date(gamesQuery.data.lastOddsSync) : null,
    lastSync: gamesQuery.data?.timestamp ? new Date(gamesQuery.data.timestamp) : null,
    
    // Loading states
    isLoading: gamesQuery.isLoading,
    isRefreshing: syncStatsMutation.isPending || syncOddsMutation.isPending,
    
    // Actions
    refresh: refreshAll,
    refetchGames: gamesQuery.refetch,
    
    // Mutations
    syncStats: syncStatsMutation.mutate,
    syncOdds: syncOddsMutation.mutate,
    validatePredictions: validatePredictionsMutation.mutate,
  };
}
