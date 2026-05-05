-- ============================================================
-- PENCA MUNDIAL 2026 - Supabase Schema
-- Ejecutar en orden en el SQL Editor de Supabase
-- ============================================================

-- TOURNAMENTS
CREATE TABLE tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  admin_token TEXT UNIQUE NOT NULL,
  invite_token TEXT UNIQUE NOT NULL,
  is_open BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PLAYERS (participants)
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, email)
);

-- MATCHES (pre-loaded from the fixture)
CREATE TABLE matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  match_number INT NOT NULL,
  phase TEXT NOT NULL, -- 'groups', 'r16', 'qf', 'sf', 'final'
  phase_multiplier INT NOT NULL DEFAULT 1,
  match_datetime TIMESTAMPTZ NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INT, -- null until official result
  away_score INT, -- null until official result
  is_tbd BOOLEAN DEFAULT false, -- true for knockout TBD teams
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PREDICTIONS
CREATE TABLE predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  predicted_home INT NOT NULL,
  predicted_away INT NOT NULL,
  points_awarded INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, match_id)
);

-- SCORING RULES (stored for reference)
-- Resultado exacto (ambos goles): base * 5
-- Ganador correcto (no exacto): base * 2
-- Goles exactos de un equipo (no exacto): base * 1 cada uno
-- Empate correcto (no exacto): base * 2
-- Phase multipliers: groups=1, r16=2, qf=4, sf=8, final=16

-- RLS Policies
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Allow public read on tournaments (needed for invite links)
CREATE POLICY "tournaments_public_read" ON tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_public_insert" ON tournaments FOR INSERT WITH CHECK (true);
CREATE POLICY "tournaments_public_update" ON tournaments FOR UPDATE USING (true);

CREATE POLICY "players_public_read" ON players FOR SELECT USING (true);
CREATE POLICY "players_public_insert" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_public_update" ON players FOR UPDATE USING (true);

CREATE POLICY "matches_public_read" ON matches FOR SELECT USING (true);
CREATE POLICY "matches_public_insert" ON matches FOR INSERT WITH CHECK (true);
CREATE POLICY "matches_public_update" ON matches FOR UPDATE USING (true);

CREATE POLICY "predictions_public_read" ON predictions FOR SELECT USING (true);
CREATE POLICY "predictions_public_insert" ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "predictions_public_update" ON predictions FOR UPDATE USING (true);

-- ============================================================
-- FUNCTION: Calculate and update points for a match
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_match_points(p_match_id UUID)
RETURNS void AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_pred predictions%ROWTYPE;
  v_points INT;
  v_mult INT;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.home_score IS NULL OR v_match.away_score IS NULL THEN RETURN; END IF;
  
  v_mult := v_match.phase_multiplier;
  
  FOR v_pred IN SELECT * FROM predictions WHERE match_id = p_match_id LOOP
    v_points := 0;
    
    -- Resultado exacto: 5 puntos base
    IF v_pred.predicted_home = v_match.home_score AND v_pred.predicted_away = v_match.away_score THEN
      v_points := 5 * v_mult;
    ELSE
      -- Ganador/empate correcto: 2 puntos base
      IF (v_pred.predicted_home > v_pred.predicted_away AND v_match.home_score > v_match.away_score) OR
         (v_pred.predicted_home < v_pred.predicted_away AND v_match.home_score < v_match.away_score) OR
         (v_pred.predicted_home = v_pred.predicted_away AND v_match.home_score = v_match.away_score) THEN
        v_points := v_points + (2 * v_mult);
      END IF;
      -- Goles exactos de local: +1
      IF v_pred.predicted_home = v_match.home_score THEN
        v_points := v_points + (1 * v_mult);
      END IF;
      -- Goles exactos de visita: +1
      IF v_pred.predicted_away = v_match.away_score THEN
        v_points := v_points + (1 * v_mult);
      END IF;
    END IF;
    
    UPDATE predictions SET points_awarded = v_points, updated_at = NOW()
    WHERE id = v_pred.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
