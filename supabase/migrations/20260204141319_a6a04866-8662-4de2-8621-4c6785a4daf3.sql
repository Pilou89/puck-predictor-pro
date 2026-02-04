-- Créer la fonction de mise à jour du timestamp si elle n'existe pas
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Nouvelle table pour les métriques d'apprentissage IA
CREATE TABLE public.learning_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  wins INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  roi DECIMAL(6,2) DEFAULT 0,
  confidence_adjustment INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(metric_type, metric_key)
);

-- Index pour performance
CREATE INDEX idx_learning_metrics_type ON public.learning_metrics(metric_type);
CREATE INDEX idx_learning_metrics_key ON public.learning_metrics(metric_key);

-- Trigger pour mise à jour automatique du timestamp
CREATE TRIGGER update_learning_metrics_updated_at
  BEFORE UPDATE ON public.learning_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS - Lecture publique pour le dashboard
ALTER TABLE public.learning_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learning metrics are publicly readable"
  ON public.learning_metrics
  FOR SELECT
  USING (true);

CREATE POLICY "Learning metrics can be updated by system"
  ON public.learning_metrics
  FOR ALL
  USING (true)
  WITH CHECK (true);