// NHL Smart Predictor Pro - Type Definitions

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  startTime: Date;
  venue?: string;
  status: MatchStatus;
}

export interface Team {
  abbr: string;
  name: string;
  logo?: string;
  isBackToBack?: boolean;
  pimPerGame?: number;
  recentForm?: RecentForm;
}

export interface RecentForm {
  wins: number;
  losses: number;
  otLosses: number;
}

export type MatchStatus = 'scheduled' | 'live' | 'final' | 'postponed';

export interface PlayerStat {
  id: string;
  gameDate: Date;
  teamAbbr: string;
  scorer: string;
  assist1?: string;
  assist2?: string;
  duo?: string;
  situation: GoalSituation;
  matchName: string;
}

export type GoalSituation = 'EV' | 'PP' | 'SH' | 'EN';

export interface WinamaxOdd {
  id: string;
  commenceTime: Date;
  matchName: string;
  selection: string;
  price: number;
  marketType: MarketType;
}

export type MarketType = 'h2h' | 'player_anytime_goal_scorer' | 'player_points';

export interface TeamMeta {
  teamAbbr: string;
  pimPerGame: number;
  lastGameDate?: Date;
  isB2B: boolean;
}

export interface PredictionHistory {
  id: string;
  predictionDate: Date;
  selection: string;
  outcomeWin: boolean;
  observedPrice: number;
}

export interface PredictionStats {
  totalPredictions: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
}

// Badge types for UI
export type BadgeType = 'fire' | 'btb' | 'discipline' | 'pp' | 'hot-duo';

export interface PlayerBadge {
  type: BadgeType;
  label: string;
  description?: string;
}

// Team abbreviation mapping
export const TEAM_MAPPING: Record<string, string> = {
  "Anaheim Ducks": "ANA",
  "Arizona Coyotes": "ARI",
  "Boston Bruins": "BOS",
  "Buffalo Sabres": "BUF",
  "Calgary Flames": "CGY",
  "Carolina Hurricanes": "CAR",
  "Chicago Blackhawks": "CHI",
  "Colorado Avalanche": "COL",
  "Columbus Blue Jackets": "CBJ",
  "Dallas Stars": "DAL",
  "Detroit Red Wings": "DET",
  "Edmonton Oilers": "EDM",
  "Florida Panthers": "FLA",
  "Los Angeles Kings": "LAK",
  "Minnesota Wild": "MIN",
  "Montreal Canadiens": "MTL",
  "Nashville Predators": "NSH",
  "New Jersey Devils": "NJD",
  "New York Islanders": "NYI",
  "New York Rangers": "NYR",
  "Ottawa Senators": "OTT",
  "Philadelphia Flyers": "PHI",
  "Pittsburgh Penguins": "PIT",
  "San Jose Sharks": "SJS",
  "Seattle Kraken": "SEA",
  "St. Louis Blues": "STL",
  "Tampa Bay Lightning": "TBL",
  "Toronto Maple Leafs": "TOR",
  "Utah Hockey Club": "UTA",
  "Vancouver Canucks": "VAN",
  "Vegas Golden Knights": "VGK",
  "Washington Capitals": "WSH",
  "Winnipeg Jets": "WPG",
};

// Reverse mapping
export const ABBR_TO_TEAM: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_MAPPING).map(([name, abbr]) => [abbr, name])
);
