import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BankrollConfig {
  id: string;
  initial_balance: number;
  monthly_target_percent: number;
  unit_percent: number;
}

interface UserBet {
  id: string;
  bet_date: string;
  match_name: string;
  bet_type: string;
  selection: string;
  odds: number;
  stake: number;
  potential_gain: number;
  outcome: 'pending' | 'won' | 'lost' | 'void';
  actual_gain: number;
  source: 'manual' | 'ai_suggestion';
  notes?: string;
  created_at: string;
  validated_at?: string;
}

interface BankrollStats {
  initialBalance: number;
  currentBalance: number;
  totalStaked: number;
  totalWon: number;
  totalLost: number;
  pendingBets: number;
  pendingStake: number;
  roi: number;
  yield: number;
  monthlyProgress: number;
  suggestedUnit: number;
  betsHistory: UserBet[];
  dailyBalances: { date: string; balance: number }[];
}

export function useBankroll() {
  const queryClient = useQueryClient();

  // Fetch bankroll config
  const configQuery = useQuery({
    queryKey: ['bankroll-config'],
    queryFn: async (): Promise<BankrollConfig | null> => {
      const { data, error } = await supabase
        .from('bankroll_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch all user bets
  const betsQuery = useQuery({
    queryKey: ['user-bets'],
    queryFn: async (): Promise<UserBet[]> => {
      const { data, error } = await supabase
        .from('user_bets')
        .select('*')
        .order('bet_date', { ascending: false });
      
      if (error) throw error;
      return (data || []) as UserBet[];
    },
  });

  // Calculate bankroll statistics
  const calculateStats = (): BankrollStats => {
    const config = configQuery.data;
    const bets = betsQuery.data || [];
    
    const initialBalance = config?.initial_balance || 100;
    const monthlyTargetPercent = config?.monthly_target_percent || 20;
    const unitPercent = config?.unit_percent || 1;
    
    // Calculate totals
    const completedBets = bets.filter(b => b.outcome !== 'pending' && b.outcome !== 'void');
    const wonBets = bets.filter(b => b.outcome === 'won');
    const lostBets = bets.filter(b => b.outcome === 'lost');
    const pendingBets = bets.filter(b => b.outcome === 'pending');
    
    const totalStaked = completedBets.reduce((sum, b) => sum + b.stake, 0);
    const totalWon = wonBets.reduce((sum, b) => sum + b.actual_gain, 0);
    const totalLost = lostBets.reduce((sum, b) => sum + b.stake, 0);
    const pendingStake = pendingBets.reduce((sum, b) => sum + b.stake, 0);
    
    // Net profit/loss
    const netProfit = totalWon - totalLost;
    const currentBalance = initialBalance + netProfit;
    
    // ROI = (Net Profit / Total Staked) * 100
    const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : 0;
    
    // Yield = (Net Profit / Number of Bets) * 100 / Average Stake
    const avgStake = totalStaked / (completedBets.length || 1);
    const yieldVal = completedBets.length > 0 ? (netProfit / completedBets.length) / avgStake * 100 : 0;
    
    // Monthly progress (% towards monthly target)
    const monthlyTarget = initialBalance * (monthlyTargetPercent / 100);
    const monthlyProgress = monthlyTarget > 0 ? Math.min((netProfit / monthlyTarget) * 100, 100) : 0;
    
    // Suggested unit (1% of current balance)
    const suggestedUnit = currentBalance * (unitPercent / 100);
    
    // Calculate daily balances for chart (last 30 days)
    const dailyBalances = calculateDailyBalances(bets, initialBalance);
    
    return {
      initialBalance,
      currentBalance,
      totalStaked,
      totalWon,
      totalLost,
      pendingBets: pendingBets.length,
      pendingStake,
      roi,
      yield: yieldVal,
      monthlyProgress,
      suggestedUnit,
      betsHistory: bets,
      dailyBalances,
    };
  };

  // Calculate daily balance evolution
  const calculateDailyBalances = (bets: UserBet[], initialBalance: number) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dailyMap = new Map<string, number>();
    
    // Initialize with zeros for all 30 days
    for (let i = 0; i <= 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (30 - i));
      const dateStr = date.toISOString().split('T')[0];
      dailyMap.set(dateStr, 0);
    }
    
    // Calculate daily profit/loss
    const completedBets = bets.filter(b => 
      b.outcome !== 'pending' && 
      b.outcome !== 'void' &&
      new Date(b.bet_date) >= thirtyDaysAgo
    );
    
    for (const bet of completedBets) {
      const dateStr = bet.bet_date;
      const currentValue = dailyMap.get(dateStr) || 0;
      
      if (bet.outcome === 'won') {
        dailyMap.set(dateStr, currentValue + bet.actual_gain);
      } else if (bet.outcome === 'lost') {
        dailyMap.set(dateStr, currentValue - bet.stake);
      }
    }
    
    // Convert to cumulative balance
    const sortedDates = Array.from(dailyMap.keys()).sort();
    let runningBalance = initialBalance;
    
    return sortedDates.map(date => {
      runningBalance += dailyMap.get(date) || 0;
      return { date, balance: runningBalance };
    });
  };

  // Update bankroll config
  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<BankrollConfig>) => {
      const config = configQuery.data;
      
      if (config) {
        const { error } = await supabase
          .from('bankroll_config')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', config.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bankroll_config')
          .insert({
            initial_balance: updates.initial_balance || 100,
            monthly_target_percent: updates.monthly_target_percent || 20,
            unit_percent: updates.unit_percent || 1,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankroll-config'] });
    },
  });

  // Add new bet
  const addBetMutation = useMutation({
    mutationFn: async (bet: Omit<UserBet, 'id' | 'created_at' | 'validated_at'>) => {
      const { error } = await supabase
        .from('user_bets')
        .insert({
          bet_date: bet.bet_date,
          match_name: bet.match_name,
          bet_type: bet.bet_type,
          selection: bet.selection,
          odds: bet.odds,
          stake: bet.stake,
          potential_gain: bet.potential_gain,
          outcome: bet.outcome,
          actual_gain: bet.actual_gain,
          source: bet.source,
          notes: bet.notes,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-bets'] });
    },
  });

  // Update bet outcome
  const updateBetMutation = useMutation({
    mutationFn: async ({ id, outcome, actual_gain }: { id: string; outcome: string; actual_gain: number }) => {
      const { error } = await supabase
        .from('user_bets')
        .update({ 
          outcome, 
          actual_gain,
          validated_at: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-bets'] });
    },
  });

  const stats = calculateStats();

  return {
    config: configQuery.data,
    stats,
    isLoading: configQuery.isLoading || betsQuery.isLoading,
    updateConfig: updateConfigMutation.mutate,
    addBet: addBetMutation.mutate,
    updateBet: updateBetMutation.mutate,
    isUpdating: updateConfigMutation.isPending || addBetMutation.isPending || updateBetMutation.isPending,
  };
}
