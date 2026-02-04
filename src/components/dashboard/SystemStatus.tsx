import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Database, Clock, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

interface CronJob {
  name: string;
  lastRun: Date | null;
  schedule: string;
  isActive: boolean;
}

interface SystemStatusProps {
  cronJobs: CronJob[];
  lastStatsSync: Date | null;
  lastOddsSync: Date | null;
  isLoading?: boolean;
  onSyncComplete?: () => void;
}

function formatTimeAgo(date: Date | null): string {
  if (!date) return "Jamais";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins}min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  return `Il y a ${diffDays}j`;
}

function getStatusColor(date: Date | null): string {
  if (!date) return "text-muted-foreground";
  
  const now = new Date();
  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  if (diffHours < 2) return "text-green-500";
  if (diffHours < 12) return "text-yellow-500";
  return "text-destructive";
}

export function SystemStatus({ 
  cronJobs, 
  lastStatsSync, 
  lastOddsSync,
  isLoading,
  onSyncComplete
}: SystemStatusProps) {
  const [isSyncingStats, setIsSyncingStats] = useState(false);
  const [isSyncingOdds, setIsSyncingOdds] = useState(false);
  
  const statsStatus = getStatusColor(lastStatsSync);
  const oddsStatus = getStatusColor(lastOddsSync);
  
  const handleSyncStats = async () => {
    setIsSyncingStats(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-nhl-stats');
      if (error) throw error;
      toast.success(`Stats NHL synchronisées (${data?.stats?.goalsRecorded || 0} buts)`);
      onSyncComplete?.();
    } catch (error) {
      console.error('Error syncing stats:', error);
      toast.error('Erreur lors de la synchronisation des stats');
    } finally {
      setIsSyncingStats(false);
    }
  };
  
  const handleSyncOdds = async () => {
    setIsSyncingOdds(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-winamax-odds');
      if (error) throw error;
      toast.success(`Cotes synchronisées (${data?.oddsRecorded || 0} cotes)`);
      onSyncComplete?.();
    } catch (error) {
      console.error('Error syncing odds:', error);
      toast.error('Erreur lors de la synchronisation des cotes');
    } finally {
      setIsSyncingOdds(false);
    }
  };
  
  const handleSyncAll = async () => {
    toast.info('Synchronisation en cours...');
    await Promise.all([handleSyncStats(), handleSyncOdds()]);
  };
  
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Statut du Système
            {isLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSyncAll}
            disabled={isSyncingStats || isSyncingOdds}
            className="h-7 text-xs"
          >
            {(isSyncingStats || isSyncingOdds) ? (
              <>
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                Sync...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 mr-1" />
                Tout sync
              </>
            )}
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Sync Status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium">Stats NHL</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5"
                onClick={handleSyncStats}
                disabled={isSyncingStats}
              >
                <RefreshCw className={cn("w-3 h-3", isSyncingStats && "animate-spin")} />
              </Button>
            </div>
            <div className={cn("text-sm font-semibold", statsStatus)}>
              {formatTimeAgo(lastStatsSync)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {lastStatsSync?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) || '-'}
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium">Cotes Winamax</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5"
                onClick={handleSyncOdds}
                disabled={isSyncingOdds}
              >
                <RefreshCw className={cn("w-3 h-3", isSyncingOdds && "animate-spin")} />
              </Button>
            </div>
            <div className={cn("text-sm font-semibold", oddsStatus)}>
              {formatTimeAgo(lastOddsSync)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {lastOddsSync?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) || '-'}
            </div>
          </div>
        </div>

        {/* Cron Jobs Status */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Tâches Planifiées
          </div>
          <div className="space-y-1.5">
            {cronJobs.map((job, index) => (
              <div 
                key={index}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-background/50 text-xs"
              >
                <div className="flex items-center gap-2">
                  {job.isActive ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-destructive" />
                  )}
                  <span className="font-medium">{job.name}</span>
                </div>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  {job.schedule}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="pt-2 border-t border-border/50 flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>&lt; 2h</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span>&lt; 12h</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <span>&gt; 12h</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
