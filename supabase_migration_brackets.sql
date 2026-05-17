-- ============================================================
-- MIGRACIÓN: Gestión de cruces por fase eliminatoria
-- Ejecutar en SQL Editor de Supabase (sobre el schema existente)
-- ============================================================

-- Agregar columna para indicar si el partido fue confirmado por el admin
ALTER TABLE matches ADD COLUMN IF NOT EXISTS teams_confirmed BOOLEAN DEFAULT false;

-- Vista auxiliar: clasificados por fase (para ayudar al admin a ver quién clasificó)
-- No es una tabla, solo una función de consulta útil

-- FUNCIÓN: Insertar partidos de una nueva fase eliminatoria
-- El admin llama a esta función desde el panel cuando confirma los cruces
CREATE OR REPLACE FUNCTION create_knockout_matches(
  p_tournament_id UUID,
  p_phase TEXT,          -- 'r16', 'qf', 'sf', 'final'
  p_phase_multiplier INT,
  p_matches JSONB        -- Array de {match_number, match_datetime, home_team, away_team}
) RETURNS void AS $$
DECLARE
  v_match JSONB;
BEGIN
  -- Borrar partidos TBD de esta fase que aún no tienen equipos confirmados
  DELETE FROM matches 
  WHERE tournament_id = p_tournament_id 
    AND phase = p_phase 
    AND teams_confirmed = false;

  -- Insertar los nuevos partidos con equipos reales
  FOR v_match IN SELECT * FROM jsonb_array_elements(p_matches) LOOP
    INSERT INTO matches (
      tournament_id, match_number, phase, phase_multiplier,
      match_datetime, home_team, away_team, is_tbd, teams_confirmed
    ) VALUES (
      p_tournament_id,
      (v_match->>'match_number')::INT,
      p_phase,
      p_phase_multiplier,
      (v_match->>'match_datetime')::TIMESTAMPTZ,
      v_match->>'home_team',
      v_match->>'away_team',
      false,
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
