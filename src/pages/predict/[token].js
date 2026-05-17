import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { MATCHES_FIXTURE, PHASE_LABELS } from '../../lib/fixture'
import Head from 'next/head'

const PHASE_COLORS = {
  groups: { bg: 'rgba(52,152,219,0.1)', border: 'rgba(52,152,219,0.3)', text: '#3498DB' },
  r16:    { bg: 'rgba(46,204,113,0.1)',  border: 'rgba(46,204,113,0.3)',  text: '#2ECC71' },
  qf:     { bg: 'rgba(201,168,76,0.1)',  border: 'rgba(201,168,76,0.3)',  text: '#C9A84C' },
  sf:     { bg: 'rgba(231,76,60,0.1)',   border: 'rgba(231,76,60,0.3)',   text: '#E74C3C' },
  final:  { bg: 'rgba(155,89,182,0.1)', border: 'rgba(155,89,182,0.3)', text: '#9B59B6' },
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

  const [player, setPlayer]           = useState(null)
  const [tournament, setTournament]   = useState(null)
  const [matches, setMatches]         = useState([])
  const [predictions, setPredictions] = useState({})
  const [allPlayers, setAllPlayers]   = useState([])
  const [allPredictions, setAllPredictions] = useState([])
  const [saving, setSaving]           = useState({})
  const [savedAt, setSavedAt]         = useState({})
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [activeTab, setActiveTab]     = useState('penca')   // 'penca' | 'ranking'
  const [activePhase, setActivePhase] = useState('groups')
  const [copyMsg, setCopyMsg]         = useState('')

  useEffect(() => { if (token) loadData() }, [token])

  async function loadData() {
    const { data: playerData, error: pErr } = await supabase
      .from('players').select('*, tournaments(*)').eq('token', token).single()
    if (pErr || !playerData) { setError('Link inválido.'); setLoading(false); return }

    setPlayer(playerData)
    setTournament(playerData.tournaments)

    // Load matches
    const { data: matchData } = await supabase
      .from('matches').select('*').eq('tournament_id', playerData.tournament_id).order('match_number')
    setMatches(matchData || [])

    // Load own predictions
    const { data: predData } = await supabase
      .from('predictions').select('*').eq('player_id', playerData.id)
    const predMap = {}
    ;(predData || []).forEach(p => {
      predMap[p.match_id] = { home: p.predicted_home, away: p.predicted_away, id: p.id, points_awarded: p.points_awarded }
    })
    setPredictions(predMap)

    // Load all players for ranking
    const { data: playersData } = await supabase
      .from('players').select('*').eq('tournament_id', playerData.tournament_id)
    setAllPlayers(playersData || [])

    // Load all predictions for ranking
    const ids = (playersData || []).map(p => p.id)
    if (ids.length) {
      const { data: allPreds } = await supabase.from('predictions').select('*').in('player_id', ids)
      setAllPredictions(allPreds || [])
    }

    setLoading(false)
  }

  // ── Prediction save ───────────────────────────────────────────────────────

  const savePrediction = useCallback(async (matchId, home, away) => {
    if (home === '' || away === '') return
    const homeNum = parseInt(home)
    const awayNum = parseInt(away)
    if (isNaN(homeNum) || isNaN(awayNum)) return
    setSaving(s => ({ ...s, [matchId]: true }))
    const existing = predictions[matchId]
    let err
    if (existing?.id) {
      const res = await supabase.from('predictions').update({
        predicted_home: homeNum, predicted_away: awayNum, updated_at: new Date().toISOString()
      }).eq('id', existing.id)
      err = res.error
    } else {
      const res = await supabase.from('predictions').insert({
        player_id: player.id, match_id: matchId, predicted_home: homeNum, predicted_away: awayNum
      }).select().single()
      if (!res.error) setPredictions(p => ({ ...p, [matchId]: { ...p[matchId], id: res.data.id } }))
      err = res.error
    }
    setSaving(s => ({ ...s, [matchId]: false }))
    if (!err) setSavedAt(s => ({ ...s, [matchId]: new Date() }))
  }, [player, predictions])

  function handleScoreChange(matchId, side, value) {
    const v = value.replace(/[^0-9]/g, '').slice(0, 2)
    setPredictions(p => ({ ...p, [matchId]: { ...p[matchId], [side]: v } }))
  }

  function handleScoreBlur(matchId) {
    const pred = predictions[matchId] || {}
    if (pred.home !== undefined && pred.away !== undefined && pred.home !== '' && pred.away !== '') {
      savePrediction(matchId, pred.home, pred.away)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const byPhase = {}
  matches.forEach(m => { if (!byPhase[m.phase]) byPhase[m.phase] = []; byPhase[m.phase].push(m) })
  const phases = ['groups', 'r16', 'qf', 'sf', 'final'].filter(p => byPhase[p]?.length)

  const filledCount  = Object.values(predictions).filter(p => p.home !== undefined && p.away !== undefined && p.home !== '' && p.away !== '').length
  const totalMatches = matches.length
  const isClosed     = tournament && !tournament.is_open
  const myPoints     = Object.values(predictions).reduce((s, p) => s + (p.points_awarded || 0), 0)

  // Build leaderboard
  const leaderboard = allPlayers.map(pl => {
    const preds = allPredictions.filter(p => p.player_id === pl.id)
    const pts   = preds.reduce((s, p) => s + (p.points_awarded || 0), 0)
    const exactResults = preds.filter(p => {
      const m = matches.find(m => m.id === p.match_id)
      return m && m.home_score !== null && p.predicted_home === m.home_score && p.predicted_away === m.away_score
    }).length
    return { ...pl, pts, exactResults, predicted: preds.length }
  }).sort((a, b) => b.pts - a.pts)

  const myRank = leaderboard.findIndex(p => p.id === player?.id) + 1

  function copyMyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopyMsg('¡Copiado!'); setTimeout(() => setCopyMsg(''), 2000)
    })
  }

  if (loading) return <LoadingScreen />
  if (error)   return <ErrorScreen msg={error} />

  return (
    <>
      <Head>
        <title>{player?.first_name} - {tournament?.name} | Penca Mundial 2026</title>
      </Head>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="font-display" style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              {tournament?.name}
            </div>
            <h1 className="font-display" style={{ fontSize: '1.8rem', fontWeight: 900 }}>
              {player?.first_name} {player?.last_name}
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', gap: '1rem' }}>
              <span>{filledCount}/{totalMatches} predichos</span>
              {myPoints > 0 && <span style={{ color: 'var(--gold)', fontWeight: 700 }}>🏆 {myPoints} pts — #{myRank}</span>}
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

        {/* ── Main tabs ── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          {[
            { id: 'penca',   label: '🎯 Mis predicciones' },
            { id: 'ranking', label: `🏆 Ranking (${allPlayers.length})` },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '0.75rem 1.25rem', background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--gold)' : 'transparent'}`,
              color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-muted)',
              fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700, fontSize: '0.9rem',
              letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ══════════════════════════════════════
            TAB: PENCA
        ══════════════════════════════════════ */}
        {activeTab === 'penca' && (
          <>
            {/* Progress bar */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ height: '4px', background: 'var(--dark-4)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '2px', background: 'linear-gradient(90deg, var(--gold-dark), var(--gold-light))', width: `${totalMatches ? (filledCount / totalMatches) * 100 : 0}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>{Math.round(totalMatches ? (filledCount / totalMatches) * 100 : 0)}% completado</span>
                {filledCount === totalMatches && totalMatches > 0 && <span style={{ color: 'var(--gold)' }}>✅ ¡Penca completa!</span>}
              </div>
            </div>

            {/* Phase tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
              {phases.map(phase => {
                const pm     = byPhase[phase] || []
                const filled = pm.filter(m => { const p = predictions[m.id]; return p && p.home !== undefined && p.away !== undefined && p.home !== '' && p.away !== '' }).length
                const isActive = activePhase === phase
                const col    = PHASE_COLORS[phase]
                return (
                  <button key={phase} onClick={() => setActivePhase(phase)} style={{
                    whiteSpace: 'nowrap', padding: '0.5rem 1rem', borderRadius: '8px',
                    border: `1px solid ${isActive ? col.border : 'var(--border)'}`,
                    background: isActive ? col.bg : 'transparent',
                    color: isActive ? col.text : 'var(--text-muted)',
                    fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700, fontSize: '0.8rem',
                    letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    {PHASE_LABELS[phase]}
                    <span style={{ marginLeft: '0.4rem', opacity: 0.7 }}>{filled}/{pm.length}</span>
                  </button>
                )
              })}
            </div>

            {/* Matches */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(byPhase[activePhase] || []).map((match, i) => {
                const pred     = predictions[match.id] || {}
                const isSaving = saving[match.id]
                const wasSaved = savedAt[match.id]
                const col      = PHASE_COLORS[activePhase]
                const isLocked = isClosed || (match.home_score !== null && match.home_score !== undefined)
                const dt       = new Date(match.match_datetime)
                const dateStr  = dt.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' })
                const timeStr  = dt.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
                const homeFlag = TEAM_FLAGS[match.home_team] || '🏳️'
                const awayFlag = TEAM_FLAGS[match.away_team] || '🏳️'

                return (
                  <div key={match.id} className="card" style={{ padding: '1rem 1.25rem', borderLeft: `3px solid ${col.border}`, opacity: isLocked ? 0.85 : 1, animation: `fadeUp 0.3s ease ${i * 0.02}s both` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: '70px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{dateStr}</div>
                        <div className="font-display" style={{ fontSize: '1rem', fontWeight: 800 }}>{timeStr}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Hora UY</div>
                      </div>

                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                            <span className="font-display" style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.05em' }}>{match.home_team}</span>
                            <span style={{ fontSize: '1.3rem' }}>{homeFlag}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                          <input className="score-input" type="number" min="0" max="99"
                            value={pred.home ?? ''} disabled={isLocked} placeholder="-"
                            onChange={e => handleScoreChange(match.id, 'home', e.target.value)}
                            onBlur={() => handleScoreBlur(match.id)} />
                          <span className="font-display" style={{ fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 900 }}>:</span>
                          <input className="score-input" type="number" min="0" max="99"
                            value={pred.away ?? ''} disabled={isLocked} placeholder="-"
                            onChange={e => handleScoreChange(match.id, 'away', e.target.value)}
                            onBlur={() => handleScoreBlur(match.id)} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '1.3rem' }}>{awayFlag}</span>
                            <span className="font-display" style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.05em' }}>{match.away_team}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ width: '24px', textAlign: 'center' }}>
                        {isSaving  && <span style={{ fontSize: '0.8rem' }}>💾</span>}
                        {!isSaving && wasSaved && <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>✓</span>}
                        {isLocked && !isSaving && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>🔒</span>}
                      </div>
                    </div>

                    {match.home_score !== null && match.home_score !== undefined && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Resultado oficial:</span>
                        <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{match.home_team} {match.home_score} - {match.away_score} {match.away_team}</span>
                        {pred.home !== undefined && (
                          <span style={{ color: (pred.points_awarded || 0) > 0 ? 'var(--green)' : '#E74C3C', fontWeight: 700 }}>
                            • {pred.points_awarded || 0} pts
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="card" style={{ marginTop: '2rem', padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ fontSize: '1.5rem' }}>📈</span>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text)' }}>Multiplicadores:</strong>{' '}
                Grupos ×1 · 16avos ×2 · Cuartos ×4 · Semis ×8 · Final ×16
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            TAB: RANKING
        ══════════════════════════════════════ */}
        {activeTab === 'ranking' && (
          <div>
            {/* My position highlight */}
            {myRank > 0 && (
              <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', borderColor: 'rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="font-display text-gold" style={{ fontSize: '2.5rem', fontWeight: 900 }}>#{myRank}</div>
                <div>
                  <div style={{ fontWeight: 700 }}>Tu posición actual</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{myPoints} puntos · {Object.values(predictions).filter(p => p.points_awarded > 0).length} aciertos</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {leaderboard.map((p, idx) => {
                const isMe    = p.id === player?.id
                const medal   = ['🥇','🥈','🥉'][idx] || `${idx + 1}`
                const bc      = isMe ? 'rgba(201,168,76,0.5)' : ['#C9A84C','#888','#CD7F32'][idx] || 'transparent'
                return (
                  <div key={p.id} className="card" style={{
                    padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem',
                    borderLeft: `3px solid ${bc}`,
                    background: isMe ? 'rgba(201,168,76,0.04)' : undefined,
                  }}>
                    <div className="font-display" style={{ fontSize: '1.1rem', fontWeight: 900, width: '2rem', textAlign: 'center' }}>{medal}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {p.first_name} {p.last_name}
                        {isMe && <span style={{ fontSize: '0.7rem', color: 'var(--gold)', background: 'rgba(201,168,76,0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700, letterSpacing: '0.05em' }}>VOS</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span>🎯 {p.exactResults} exactos</span>
                        <span>📋 {p.predicted}/{matches.length} predichos</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 900, color: isMe ? 'var(--gold)' : 'var(--text)' }}>{p.pts}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>pts</div>
                    </div>
                  </div>
                )
              })}
              {leaderboard.length === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aún no hay participantes.
                </div>
              )}
            </div>

            <div className="card" style={{ marginTop: '1.5rem', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                <span>ℹ️</span>
                <span>El ranking se actualiza cada vez que el administrador carga un resultado oficial.</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '2rem' }}>⚽</div>
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
