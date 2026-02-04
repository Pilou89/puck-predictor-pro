-- NHL Smart Predictor Pro - Database Schema
-- Player statistics from NHL API

CREATE TABLE public.player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date DATE NOT NULL,
  team_abbr TEXT NOT NULL,
  scorer TEXT NOT NULL,
  assist1 TEXT,
  assist2 TEXT,
  duo TEXT,
  situation TEXT NOT NULL CHECK (situation IN ('EV', 'PP', 'SH', 'EN')),
  match_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Winamax odds from The Odds API
CREATE TABLE public.winamax_odds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commence_time TIMESTAMP WITH TIME ZONE NOT NULL,
  match_name TEXT NOT NULL,
  selection TEXT NOT NULL,
  price FLOAT8 NOT NULL,
  market_type TEXT NOT NULL CHECK (market_type IN ('h2h', 'player_anytime_goal_scorer', 'player_points')),
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team metadata for B2B detection and PIM tracking
CREATE TABLE public.team_meta (
  team_abbr TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  pim_per_game FLOAT8 DEFAULT 0,
  last_game_date DATE,
  is_b2b BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prediction history for learning/ROI tracking
CREATE TABLE public.prediction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_date DATE NOT NULL,
  match_name TEXT NOT NULL,
  selection TEXT NOT NULL,
  market_type TEXT NOT NULL,
  predicted_odds FLOAT8 NOT NULL,
  outcome_win BOOLEAN,
  validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cron job configuration for sync scheduling
CREATE TABLE public.cron_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT UNIQUE NOT NULL,
  schedule_time TIME NOT NULL,
  timezone TEXT DEFAULT 'Europe/Paris',
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winamax_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_config ENABLE ROW LEVEL SECURITY;

-- Public read access policies (data is public analytics)
CREATE POLICY "Allow public read access to player_stats"
  ON public.player_stats FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to winamax_odds"
  ON public.winamax_odds FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to team_meta"
  ON public.team_meta FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to prediction_history"
  ON public.prediction_history FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to cron_config"
  ON public.cron_config FOR SELECT
  USING (true);

-- Create indexes for performance
CREATE INDEX idx_player_stats_game_date ON public.player_stats(game_date DESC);
CREATE INDEX idx_player_stats_scorer ON public.player_stats(scorer);
CREATE INDEX idx_player_stats_team ON public.player_stats(team_abbr);
CREATE INDEX idx_player_stats_duo ON public.player_stats(duo);
CREATE INDEX idx_winamax_odds_match ON public.winamax_odds(match_name);
CREATE INDEX idx_winamax_odds_commence ON public.winamax_odds(commence_time);
CREATE INDEX idx_prediction_history_date ON public.prediction_history(prediction_date DESC);

-- Insert default cron schedules (Paris timezone)
INSERT INTO public.cron_config (job_name, schedule_time, timezone) VALUES
  ('sync_nhl_stats', '09:00:00', 'Europe/Paris'),
  ('sync_winamax_odds', '20:00:00', 'Europe/Paris'),
  ('sync_winamax_odds_night', '23:00:00', 'Europe/Paris'),
  ('validate_predictions', '09:00:00', 'Europe/Paris');