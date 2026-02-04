import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Match, BadgeType } from "@/types/nhl";
import { Battery, Flame, AlertCircle, Zap } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface MatchCardProps {
  match: Match;
  badges?: { home: BadgeType[]; away: BadgeType[] };
}

const badgeConfig: Record<BadgeType, { icon: React.ReactNode; label: string; className: string }> = {
  fire: {
    icon: <Flame className="w-3 h-3" />,
    label: "En Feu",
    className: "badge-fire",
  },
  btb: {
    icon: <Battery className="w-3 h-3" />,
    label: "B2B",
    className: "badge-btb",
  },
  discipline: {
    icon: <AlertCircle className="w-3 h-3" />,
    label: "PIM+",
    className: "badge-discipline",
  },
  pp: {
    icon: <Zap className="w-3 h-3" />,
    label: "PP Opp",
    className: "badge-pp",
  },
  "hot-duo": {
    icon: <Flame className="w-3 h-3" />,
    label: "Duo",
    className: "badge-fire",
  },
};

export function MatchCard({ match, badges }: MatchCardProps) {
  const isLive = match.status === "live";
  const formattedTime = format(match.startTime, "HH:mm", { locale: fr });

  return (
    <Card className="glass-card p-4 hover:border-primary/50 transition-all duration-300 group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-success">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse-glow" />
              LIVE
            </span>
          )}
          <span className="text-sm text-muted-foreground font-mono">
            {formattedTime}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {format(match.startTime, "dd MMM", { locale: fr })}
        </span>
      </div>

      <div className="space-y-3">
        {/* Away Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center font-mono font-bold text-sm">
              {match.awayTeam.abbr}
            </div>
            <div>
              <p className="font-medium">{match.awayTeam.name}</p>
              <div className="flex gap-1 mt-1">
                {badges?.away.map((badge, i) => (
                  <Badge key={i} className={`${badgeConfig[badge].className} text-[10px] px-1.5 py-0 h-5`}>
                    {badgeConfig[badge].icon}
                    <span className="ml-1">{badgeConfig[badge].label}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          {match.awayTeam.recentForm && (
            <span className="text-xs text-muted-foreground font-mono">
              {match.awayTeam.recentForm.wins}-{match.awayTeam.recentForm.losses}-{match.awayTeam.recentForm.otLosses}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">@</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Home Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center font-mono font-bold text-sm">
              {match.homeTeam.abbr}
            </div>
            <div>
              <p className="font-medium">{match.homeTeam.name}</p>
              <div className="flex gap-1 mt-1">
                {badges?.home.map((badge, i) => (
                  <Badge key={i} className={`${badgeConfig[badge].className} text-[10px] px-1.5 py-0 h-5`}>
                    {badgeConfig[badge].icon}
                    <span className="ml-1">{badgeConfig[badge].label}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          {match.homeTeam.recentForm && (
            <span className="text-xs text-muted-foreground font-mono">
              {match.homeTeam.recentForm.wins}-{match.homeTeam.recentForm.losses}-{match.homeTeam.recentForm.otLosses}
            </span>
          )}
        </div>
      </div>

      {/* Hover effect indicator */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </Card>
  );
}
