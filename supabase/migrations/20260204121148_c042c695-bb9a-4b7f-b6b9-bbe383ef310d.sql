-- Create user_bets table for tracking real bets (separate from AI predictions)
CREATE TABLE public.user_bets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bet_date DATE NOT NULL DEFAULT CURRENT_DATE,
  match_name TEXT NOT NULL,
  bet_type TEXT NOT NULL, -- 'h2h', 'scorer', 'duo', 'points_solo'
  selection TEXT NOT NULL,
  odds DOUBLE PRECISION NOT NULL,
  stake DOUBLE PRECISION NOT NULL, -- Amount wagered in euros
  potential_gain DOUBLE PRECISION NOT NULL, -- stake * odds
  outcome TEXT DEFAULT 'pending', -- 'pending', 'won', 'lost', 'void'
  actual_gain DOUBLE PRECISION DEFAULT 0, -- Net profit/loss after resolution
  source TEXT DEFAULT 'manual', -- 'manual', 'ai_suggestion'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  validated_at TIMESTAMP WITH TIME ZONE
);

-- Create bankroll_config table for storing user's initial balance and settings
CREATE TABLE public.bankroll_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  initial_balance DOUBLE PRECISION NOT NULL DEFAULT 100,
  monthly_target_percent DOUBLE PRECISION DEFAULT 20, -- Target 20% profit per month
  unit_percent DOUBLE PRECISION DEFAULT 1, -- 1 unit = 1% of current balance
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bankroll_config ENABLE ROW LEVEL SECURITY;

-- Create public read policies
CREATE POLICY "Allow public read access to user_bets" 
ON public.user_bets 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert to user_bets" 
ON public.user_bets 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update to user_bets" 
ON public.user_bets 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public read access to bankroll_config" 
ON public.bankroll_config 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert to bankroll_config" 
ON public.bankroll_config 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update to bankroll_config" 
ON public.bankroll_config 
FOR UPDATE 
USING (true);

-- Insert default bankroll config
INSERT INTO public.bankroll_config (initial_balance, monthly_target_percent, unit_percent)
VALUES (100, 20, 1);

-- Create index for performance
CREATE INDEX idx_user_bets_date ON public.user_bets(bet_date DESC);
CREATE INDEX idx_user_bets_outcome ON public.user_bets(outcome);