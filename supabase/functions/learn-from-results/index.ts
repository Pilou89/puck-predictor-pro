import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface LearningMetric {
  metric_type: 'market' | 'team' | 'player' | 'context';
  metric_key: string;
  wins: number;
  total: number;
  roi: number;
  confidence_adjustment: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting learning from results...');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    // Fetch validated bets from last 30 days
    const { data: bets, error: betsError } = await supabase
      .from('user_bets')
      .select('*')
      .gte('bet_date', thirtyDaysAgoStr)
      .not('outcome', 'eq', 'pending');

    if (betsError) throw betsError;

    console.log(`Analyzing ${bets?.length || 0} validated bets`);

    if (!bets || bets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No bets to learn from', metricsUpdated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const metricsMap = new Map<string, LearningMetric>();

    // Helper to update or create metric
    const updateMetric = (type: LearningMetric['metric_type'], key: string, isWin: boolean, roi: number) => {
      const mapKey = `${type}:${key}`;
      const existing = metricsMap.get(mapKey) || {
        metric_type: type,
        metric_key: key,
        wins: 0,
        total: 0,
        roi: 0,
        confidence_adjustment: 0,
      };
      
      existing.total++;
      if (isWin) existing.wins++;
      existing.roi += roi;
      
      metricsMap.set(mapKey, existing);
    };

    // Process each bet
    for (const bet of bets) {
      const isWin = bet.outcome === 'won';
      const roi = isWin ? (bet.actual_gain || 0) : -bet.stake;
      const roiPercent = (roi / bet.stake) * 100;

      // Market type learning
      updateMetric('market', bet.bet_type, isWin, roiPercent);

      // Team learning (extract from match name)
      const matchParts = bet.match_name.split(/\s+(?:vs|@|at)\s+/i);
      if (matchParts.length === 2) {
        // Check if selection contains a team name
        for (const part of matchParts) {
          if (bet.selection.toLowerCase().includes(part.toLowerCase().substring(0, 4))) {
            updateMetric('team', extractTeamAbbr(part), isWin, roiPercent);
            break;
          }
        }
      }

      // Player learning - extract player names from selection or notes
      const playerRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)/g;
      const selectionPlayers = bet.selection.match(playerRegex) || [];
      const notesPlayers = bet.notes?.match(playerRegex) || [];
      const allPlayers = [...new Set([...selectionPlayers, ...notesPlayers])];
      
      for (const player of allPlayers) {
        // Skip team names and short matches
        if (player.length > 4 && !player.includes(' vs ') && !player.includes(' @ ')) {
          updateMetric('player', player.toLowerCase(), isWin, roiPercent);
        }
      }

      // Context learning from notes
      if (bet.notes) {
        if (bet.notes.toLowerCase().includes('b2b')) {
          updateMetric('context', 'b2b_opponent', isWin, roiPercent);
        }
        if (bet.notes.toLowerCase().includes('pim')) {
          updateMetric('context', 'high_pim_opponent', isWin, roiPercent);
        }
        if (bet.notes.toLowerCase().includes('duo')) {
          updateMetric('context', 'duo_active', isWin, roiPercent);
        }
      }

      // System bet type learning (detect from bet_type or notes)
      const isSystemBet = bet.bet_type?.startsWith('SYSTEM_') || bet.notes?.includes('[SYSTÈME');
      
      if (isSystemBet) {
        // Detect combo type from notes
        if (bet.notes?.includes('[SAFE]')) {
          updateMetric('context', 'safe_bets', isWin, roiPercent);
        } else if (bet.notes?.includes('[FUN]')) {
          updateMetric('context', 'fun_bets', isWin, roiPercent);
        } else if (bet.notes?.includes('[SUPER_COMBO]')) {
          updateMetric('context', 'super_combo_bets', isWin, roiPercent);
        }
        
        // Track system type performance
        const systemMatch = bet.bet_type?.match(/SYSTEM_(\d+)_(\d+)/);
        if (systemMatch) {
          updateMetric('context', `system_${systemMatch[1]}_${systemMatch[2]}`, isWin, roiPercent);
        }
      } else {
        // Non-system bets - original logic
        if (bet.bet_type === 'SAFE' || bet.notes?.includes('[SAFE]')) {
          updateMetric('context', 'safe_bets', isWin, roiPercent);
        }
        if (bet.bet_type === 'DUO' || bet.notes?.includes('[DUO]')) {
          updateMetric('context', 'duo_bets', isWin, roiPercent);
        }
        if (bet.bet_type === 'FUN' || bet.notes?.includes('[FUN]')) {
          updateMetric('context', 'fun_bets', isWin, roiPercent);
        }
        if (bet.bet_type === 'SUPER_COMBO' || bet.notes?.includes('[SUPER_COMBO]')) {
          updateMetric('context', 'super_combo_bets', isWin, roiPercent);
        }
      }
    }

    // Calculate confidence adjustments
    for (const [_, metric] of metricsMap) {
      if (metric.total >= 3) {  // Minimum sample size
        const winRate = metric.wins / metric.total;
        const avgRoi = metric.roi / metric.total;
        
        // Adjustment formula:
        // - Win rate > 60%: positive adjustment
        // - Win rate < 40%: negative adjustment
        // - ROI also influences adjustment
        
        let adjustment = 0;
        
        if (winRate >= 0.7) {
          adjustment = 15;
        } else if (winRate >= 0.6) {
          adjustment = 10;
        } else if (winRate >= 0.5) {
          adjustment = 5;
        } else if (winRate >= 0.4) {
          adjustment = 0;
        } else if (winRate >= 0.3) {
          adjustment = -5;
        } else {
          adjustment = -10;
        }
        
        // Bonus for positive ROI
        if (avgRoi > 20) adjustment += 5;
        if (avgRoi > 50) adjustment += 5;
        
        // Penalty for negative ROI
        if (avgRoi < -20) adjustment -= 5;
        if (avgRoi < -50) adjustment -= 5;
        
        metric.confidence_adjustment = Math.max(-20, Math.min(20, adjustment));
        metric.roi = parseFloat(avgRoi.toFixed(2));
      }
    }

    // Upsert metrics to database
    const metricsArray = Array.from(metricsMap.values());
    let upsertedCount = 0;

    for (const metric of metricsArray) {
      const { error: upsertError } = await supabase
        .from('learning_metrics')
        .upsert({
          metric_type: metric.metric_type,
          metric_key: metric.metric_key,
          wins: metric.wins,
          total: metric.total,
          roi: metric.roi,
          confidence_adjustment: metric.confidence_adjustment,
          last_updated: new Date().toISOString(),
        }, {
          onConflict: 'metric_type,metric_key',
        });

      if (!upsertError) upsertedCount++;
    }

    console.log(`Updated ${upsertedCount} learning metrics`);

    // Update cron config
    await supabase
      .from('cron_config')
      .update({ last_run_at: new Date().toISOString() })
      .eq('job_name', 'learn_from_results');

    return new Response(
      JSON.stringify({
        success: true,
        betsAnalyzed: bets.length,
        metricsUpdated: upsertedCount,
        summary: {
          markets: metricsArray.filter(m => m.metric_type === 'market').length,
          teams: metricsArray.filter(m => m.metric_type === 'team').length,
          contexts: metricsArray.filter(m => m.metric_type === 'context').length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Learn from results error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function extractTeamAbbr(teamName: string): string {
  const teamMappings: Record<string, string> = {
    'maple leafs': 'TOR', 'toronto': 'TOR',
    'canadiens': 'MTL', 'montreal': 'MTL',
    'bruins': 'BOS', 'boston': 'BOS',
    'rangers': 'NYR', 'new york rangers': 'NYR',
    'islanders': 'NYI', 'new york islanders': 'NYI',
    'devils': 'NJD', 'new jersey': 'NJD',
    'flyers': 'PHI', 'philadelphia': 'PHI',
    'penguins': 'PIT', 'pittsburgh': 'PIT',
    'capitals': 'WSH', 'washington': 'WSH',
    'hurricanes': 'CAR', 'carolina': 'CAR',
    'lightning': 'TBL', 'tampa bay': 'TBL',
    'panthers': 'FLA', 'florida': 'FLA',
    'red wings': 'DET', 'detroit': 'DET',
    'sabres': 'BUF', 'buffalo': 'BUF',
    'senators': 'OTT', 'ottawa': 'OTT',
    'blue jackets': 'CBJ', 'columbus': 'CBJ',
    'jets': 'WPG', 'winnipeg': 'WPG',
    'wild': 'MIN', 'minnesota': 'MIN',
    'blackhawks': 'CHI', 'chicago': 'CHI',
    'blues': 'STL', 'st. louis': 'STL', 'st louis': 'STL',
    'predators': 'NSH', 'nashville': 'NSH',
    'stars': 'DAL', 'dallas': 'DAL',
    'avalanche': 'COL', 'colorado': 'COL',
    'coyotes': 'ARI', 'arizona': 'ARI',
    'ducks': 'ANA', 'anaheim': 'ANA',
    'kings': 'LAK', 'los angeles': 'LAK',
    'sharks': 'SJS', 'san jose': 'SJS',
    'golden knights': 'VGK', 'vegas': 'VGK',
    'kraken': 'SEA', 'seattle': 'SEA',
    'canucks': 'VAN', 'vancouver': 'VAN',
    'flames': 'CGY', 'calgary': 'CGY',
    'oilers': 'EDM', 'edmonton': 'EDM',
    'utah': 'UTA', 'utah hockey': 'UTA',
  };

  const lower = teamName.toLowerCase();
  for (const [key, abbr] of Object.entries(teamMappings)) {
    if (lower.includes(key)) return abbr;
  }
  return teamName.substring(0, 3).toUpperCase();
}
