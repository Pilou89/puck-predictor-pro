import { Match, BadgeType } from "@/types/nhl";
import { MatchCard } from "./MatchCard";
import { Calendar, Clock } from "lucide-react";

interface UpcomingMatchesProps {
  matches: Match[];
  matchBadges: Record<string, { home: BadgeType[]; away: BadgeType[] }>;
}

export function UpcomingMatches({ matches, matchBadges }: UpcomingMatchesProps) {
  // Group matches by time slot
  const now = new Date();
  const groupedMatches = matches.reduce((acc, match) => {
    const hours = Math.floor((match.startTime.getTime() - now.getTime()) / (1000 * 60 * 60));
    
    let group: string;
    if (hours < 0) {
      group = "En cours";
    } else if (hours < 3) {
      group = "Bientôt";
    } else if (hours < 8) {
      group = "Cette nuit";
    } else {
      group = "Demain";
    }
    
    if (!acc[group]) acc[group] = [];
    acc[group].push(match);
    return acc;
  }, {} as Record<string, Match[]>);

  const groupOrder = ["En cours", "Bientôt", "Cette nuit", "Demain"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-lg">Matchs à Venir</h2>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span>Prochaines 18h</span>
        </div>
      </div>

      {groupOrder.map((group) => {
        const groupMatches = groupedMatches[group];
        if (!groupMatches?.length) return null;

        return (
          <div key={group} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                group === "En cours" ? "bg-success animate-pulse" :
                group === "Bientôt" ? "bg-warning" :
                "bg-muted-foreground"
              }`} />
              <span className="text-sm font-medium text-muted-foreground">{group}</span>
              <span className="text-xs text-muted-foreground">({groupMatches.length})</span>
            </div>
            
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {groupMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  badges={matchBadges[match.id]}
                />
              ))}
            </div>
          </div>
        );
      })}

      {matches.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucun match programmé</p>
          <p className="text-sm">dans les prochaines 18 heures</p>
        </div>
      )}
    </div>
  );
}
