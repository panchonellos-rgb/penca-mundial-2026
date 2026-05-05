import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { MATCHES_FIXTURE, PHASE_LABELS } from '../../lib/fixture'
import Head from 'next/head'

const PHASE_COLORS = {
  groups: { bg: 'rgba(52,152,219,0.1)', border: 'rgba(52,152,219,0.3)', text: '#3498DB' },
  r16: { bg: 'rgba(46,204,113,0.1)', border: 'rgba(46,204,113,0.3)', text: '#2ECC71' },
  qf: { bg: 'rgba(201,168,76,0.1)', border: 'rgba(201,168,76,0.3)', text: '#C9A84C' },
  sf: { bg: 'rgba(231,76,60,0.1)', border: 'rgba(231,76,60,0.3)', text: '#E74C3C' },
  final: { bg: 'rgba(155,89,182,0.1)', border: 'rgba(155,89,182,0.3)', text: '#9B59B6' },
}

const TEAM_FLAGS = Object.fromEntries(
  MATCHES_FIXTURE.flatMap(m => [
    [m.home_team, m.home_flag],
    [m.away_team, m.away_flag],
  ])
)

export default function PredictPage() {
  const router = useRouter()
  const { token } = router.query

  const [player, setPlayer] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [matches, setMatches] = useState([])
  const [predictions, setPredictions] = useState({}) // matchId -> {home, away}
  const [saving, setSaving] = useState({})
  const [savedAt, setSavedAt] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activePhase, setActivePhase] = useState('groups')
  const [copyMsg, setCopyMsg] = useState('')

  useEffect(() => {
    if (!token) return
    loadData()
  }, [token])

  async function loadData() {
    const { data: playerData, error: pErr } = await supabase
      .from('players').select('*, tournaments(*)').eq('token', token).single()

    if (pErr || !playerData) { setError('Link inválido.'); setLoading(false); return }

    setPlayer(playerData)
    setTournament(playerData.tournaments)

    const { data: matchData } = await supabase
      .from('matches').select('*').eq('tournament_id', playerData.tournament_id).order('match_number')

    setMatches(matchData || [])

    const { data: predData } = await supabase
      .from('predictions').select('*').eq('player_id', playerData.id)

    const predMap = {}
    ;(predData || []).forEach(p => {
      predMap[p.match_id] = { home: p.predicted_home, away: p.predicted_away, id: p.id }
    })
    setPredictions(predMap)
    setLoading(false)
  }

  const savePrediction = useCallback(async (matchId, home, away) => {
    if (home === '' || away === '') return
    const homeNum = parseInt(home)
    const awayNum = parseInt(away)
    if (isNaN(homeNum) || isNaN(awayNum)) return

    setSaving(s => ({ ...s, [matchId]: true }))

    const existing = predictions[matchId]
    let error
    if (existing?.id) {
      const res = await supabase.from('predictions').update({
        predicted_home: homeNum, predicted_away: awayNum, updated_at: new Date().toISOString()
      }).eq('id', existing.id)
      error = res.error
    } else {
      const res = await supabase.from('predictions').insert({
        player_id: player.id, match_id: matchId,
        predicted_home: homeNum, predicted_away: awayNum
      }).select().single()
      if (!res.error) {
        setPredictions(p => ({ ...p, [matchId]: { ...p[matchId], id: res.data.id } }))
      }
      error = res.error
    }

    setSaving(s => ({ ...s, [matchId]: false }))
    if (!error) setSavedAt(s => ({ ...s, [matchId]: new Date() }))
  }, [player, predictions])

  function handleScoreChange(matchId, side, value) {
    const v = value.replace(/[^0-9]/g, '').slice(0, 2)
    setPredictions(p => ({
      ...p,
      [matchId]: { ...p[matchId], [side]: v }
    }))
  }

  function handleScoreBlur(matchId) {
    const pred = predictions[matchId] || {}
    if (pred.home !== undefined && pred.away !== undefined && pred.home !== '' && pred.away !== '') {
      savePrediction(matchId, pred.home, pred.away)
    }
  }

  const byPhase = {}
  matches.forEach(m => {
    if (!byPhase[m.phase]) byPhase[m.phase] = []
    byPhase[m.phase].push(m)
  })

  const phases = ['groups', 'r16', 'qf', 'sf', 'final'].filter(p => byPhase[p]?.length)
  const filledCount = Object.values(predictions).filter(p => p.home !== undefined && p.away !== undefined && p.home !== '' && p.away !== '').length
  const totalMatches = matches.length

  function copyMyLink() {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(() => {
      setCopyMsg('¡Link copiado!')
      setTimeout(() => setCopyMsg(''), 2000)
    })
  }

  const isClosed = tournament && !tournament.is_open

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen msg={error} />

  return (
    <>
      <Head>
        <title>{player?.first_name} - {tournament?.name} | Penca Mundial 2026</title>
      </Head>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="font-display" style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              {tournament?.name}
            </div>
            <h1 className="font-display" style={{ fontSize: '1.8rem', fontWeight: 900 }}>
              {player?.first_name} {player?.last_name}
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {filledCount} / {totalMatches} partidos predichos
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
            <button className="btn-ghost" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={copyMyLink}>
              {copyMsg || '🔗 Mi link'}
            </button>
            {isClosed && (
              <span style={{ fontSize: '0.75rem', color: '#E74C3C', background: 'rgba(231,76,60,0.1)', padding: '0.25rem 0.75rem', borderRadius: '4px', border: '1px solid rgba(231,76,60,0.3)' }}>
                🔒 Predicciones cerradas
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ height: '4px', background: 'var(--dark-4)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '2px',
              background: 'linear-gradient(90deg, var(--gold-dark), var(--gold-light))',
              width: `${(filledCount / totalMatches) * 100}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>{Math.round((filledCount / totalMatches) * 100)}% completado</span>
            {filledCount === totalMatches && <span style={{ color: 'var(--gold)' }}>✅ ¡Penca completa!</span>}
          </div>
        </div>

        {/* Phase tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
          {phases.map(phase => {
            const phaseMatches = byPhase[phase] || []
            const filled = phaseMatches.filter(m => {
              const p = predictions[m.id]
              return p && p.home !== undefined && p.away !== undefined && p.home !== '' && p.away !== ''
            }).length
            const isActive = activePhase === phase
            const col = PHASE_COLORS[phase]
            return (
              <button key={phase} onClick={() => setActivePhase(phase)} style={{
                whiteSpace: 'nowrap',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: `1px solid ${isActive ? col.border : 'var(--border)'}`,
                background: isActive ? col.bg : 'transparent',
                color: isActive ? col.text : 'var(--text-muted)',
                fontFamily: 'Barlow Condensed, sans-serif',
                fontWeight: 700,
                fontSize: '0.8rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
                {PHASE_LABELS[phase]}
                <span style={{ marginLeft: '0.4rem', opacity: 0.7 }}>{filled}/{phaseMatches.length}</span>
              </button>
            )
          })}
        </div>

        {/* Matches list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {(byPhase[activePhase] || []).map((match, i) => {
            const pred = predictions[match.id] || {}
            const isSaving = saving[match.id]
            const wasSaved = savedAt[match.id]
            const col = PHASE_COLORS[activePhase]
            const isLocked = isClosed || (match.home_score !== null && match.home_score !== undefined)
            const dt = new Date(match.match_datetime)
            const dateStr = dt.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' })
            const timeStr = dt.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
            const homeFlag = TEAM_FLAGS[match.home_team] || '🏳️'
            const awayFlag = TEAM_FLAGS[match.away_team] || '🏳️'

            return (
              <div key={match.id} className="card" style={{
                padding: '1rem 1.25rem',
                borderLeft: `3px solid ${col.border}`,
                opacity: isLocked ? 0.8 : 1,
                animation: `fadeUp 0.3s ease ${i * 0.02}s both`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  {/* Date/time */}
                  <div style={{ minWidth: '70px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{dateStr}</div>
                    <div className="font-display" style={{ fontSize: '1rem', fontWeight: 800 }}>{timeStr}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Hora UY</div>
                  </div>

                  {/* Match */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    {/* Home team */}
                    <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <span className="font-display" style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.05em' }}>{match.home_team}</span>
                        <span style={{ fontSize: '1.3rem' }}>{homeFlag}</span>
                      </div>
                    </div>

                    {/* Score inputs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      <input
                        className="score-input"
                        type="number" min="0" max="99"
                        value={pred.home ?? ''}
                        disabled={isLocked}
                        onChange={e => handleScoreChange(match.id, 'home', e.target.value)}
                        onBlur={() => handleScoreBlur(match.id)}
                        placeholder="-"
                      />
                      <span className="font-display" style={{ fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 900 }}>:</span>
                      <input
                        className="score-input"
                        type="number" min="0" max="99"
                        value={pred.away ?? ''}
                        disabled={isLocked}
                        onChange={e => handleScoreChange(match.id, 'away', e.target.value)}
                        onBlur={() => handleScoreBlur(match.id)}
                        placeholder="-"
                      />
                    </div>

                    {/* Away team */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '1.3rem' }}>{awayFlag}</span>
                        <span className="font-display" style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.05em' }}>{match.away_team}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{ width: '24px', textAlign: 'center' }}>
                    {isSaving && <span style={{ fontSize: '0.8rem' }}>💾</span>}
                    {!isSaving && wasSaved && <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>✓</span>}
                    {isLocked && !isSaving && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>🔒</span>}
                  </div>
                </div>

                {/* Official result if available */}
                {match.home_score !== null && match.home_score !== undefined && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Resultado oficial:</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{match.home_team} {match.home_score} - {match.away_score} {match.away_team}</span>
                    {pred.home !== undefined && (
                      <span style={{ color: pred.points_awarded > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                        • {pred.points_awarded || 0} pts
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Multiplier note */}
        <div className="card" style={{ marginTop: '2rem', padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '1.5rem' }}>📈</span>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text)' }}>Multiplicadores de fase:</strong>{' '}
            Grupos ×1 · 16avos ×2 · Cuartos ×4 · Semi ×8 · Final ×16 —
            Los puntos de las rondas eliminatorias valen mucho más.
          </div>
        </div>

      </div>
    </>
  )
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⚽</div>
      <div className="font-display" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Cargando penca...</div>
    </div>
  )
}

function ErrorScreen({ msg }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
        <p style={{ color: 'var(--text-muted)' }}>{msg}</p>
      </div>
    </div>
  )
}
