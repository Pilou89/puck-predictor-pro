import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, Settings, Bell } from "lucide-react";

interface HeaderProps {
  lastSync?: Date;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function Header({ lastSync, onRefresh, isLoading }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-card animate-pulse-glow" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">
              NHL Smart Predictor
              <span className="text-primary ml-1">Pro</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Analytics & Predictions
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {lastSync && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Dernière sync: {lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="relative"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
          </Button>

          <Button variant="ghost" size="icon">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
