import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { PHASE_LABELS } from '../../lib/fixture'
import Head from 'next/head'

const PHASE_COLORS = {
  groups: '#3498DB', r16: '#2ECC71', qf: '#C9A84C', sf: '#E74C3C', final: '#9B59B6'
}

const TEAM_FLAGS = {
  MEX: '🇲🇽', SUD: '🇿🇦', KOR: '🇰🇷', CZE: '🇨🇿', CAN: '🇨🇦', BIH: '🇧🇦',
  USA: '🇺🇸', PAR: '🇵🇾', QAT: '🇶🇦', SUI: '🇨🇭', BRA: '🇧🇷', MAR: '🇲🇦',
  HAI: '🇭🇹', ESC: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', AUS: '🇦🇺', TUR: '🇹🇷', ALE: '🇩🇪', CUR: '🇨🇼',
  NED: '🇳🇱', JAP: '🇯🇵', CIV: '🇨🇮', ECU: '🇪🇨', SUE: '🇸🇪', TUN: '🇹🇳',
  ESP: '🇪🇸', CPV: '🇨🇻', BEL: '🇧🇪', EGP: '🇪🇬', KSA: '🇸🇦', URU: '🇺🇾',
  IRN: '🇮🇷', NZL: '🇳🇿', FRA: '🇫🇷', SEN: '🇸🇳', IRQ: '🇮🇶', NOR: '🇳🇴',
  ARG: '🇦🇷', ALG: '🇩🇿', JOR: '🇯🇴', POR: '🇵🇹', COD: '🇨🇩', ING: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  CRO: '🇭🇷', GHA: '🇬🇭', PAN: '🇵🇦', UZB: '🇺🇿', COL: '🇨🇴', JPN: '🇯🇵',
  EGY: '🇪🇬', NZL: '🇳🇿',
}

export default function AdminPage() {
  const router = useRouter()
  const { token } = router.query

  const [tournament, setTournament] = useState(null)
  const [players, setPlayers] = useState([])
  const [matches, setMatches] = useState([])
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [resultEdits, setResultEdits] = useState({})
  const [savingResult, setSavingResult] = useState({})
  const [copyMsg, setCopyMsg] = useState('')

  useEffect(() => {
    if (!token) return
    loadAll()
  }, [token])

  async function loadAll() {
    const { data: t, error: tErr } = await supabase
      .from('tournaments').select('*').eq('admin_token', token).single()

    if (tErr || !t) { setError('Acceso denegado o torneo no encontrado.'); setLoading(false); return }
    setTournament(t)

    const [playersRes, matchesRes, predsRes] = await Promise.all([
      supabase.from('players').select('*').eq('tournament_id', t.id).order('created_at'),
      supabase.from('matches').select('*').eq('tournament_id', t.id).order('match_number'),
      supabase.from('predictions').select('*, players(first_name, last_name)').in(
        'player_id',
        (await supabase.from('players').select('id').eq('tournament_id', t.id)).data?.map(p => p.id) || []
      ),
    ])

    setPlayers(playersRes.data || [])
    setMatches(matchesRes.data || [])
    setPredictions(predsRes.data || [])
    setLoading(false)
  }

  // Calculate leaderboard
  const leaderboard = players.map(player => {
    const playerPreds = predictions.filter(p => p.player_id === player.id)
    const totalPoints = playerPreds.reduce((sum, p) => sum + (p.points_awarded || 0), 0)
    const exactResults = playerPreds.filter(p => {
      const match = matches.find(m => m.id === p.match_id)
      return match && match.home_score !== null && p.predicted_home === match.home_score && p.predicted_away === match.away_score
    }).length
    const predicted = playerPreds.filter(p => p.predicted_home !== null).length
    return { ...player, totalPoints, exactResults, predicted }
  }).sort((a, b) => b.totalPoints - a.totalPoints)

  function getInviteUrl() {
    return typeof window !== 'undefined' ? `${window.location.origin}/invite/${tournament?.invite_token}` : ''
  }
  function getAdminUrl() {
    return typeof window !== 'undefined' ? window.location.href : ''
  }

  function copyInvite() {
    navigator.clipboard.writeText(getInviteUrl()).then(() => {
      setCopyMsg('¡Link de invitación copiado!')
      setTimeout(() => setCopyMsg(''), 2500)
    })
  }

  async function toggleOpen() {
    const { error } = await supabase.from('tournaments')
      .update({ is_open: !tournament.is_open }).eq('id', tournament.id)
    if (!error) setTournament(t => ({ ...t, is_open: !t.is_open }))
  }

  async function saveResult(matchId) {
    const edit = resultEdits[matchId]
    if (!edit || edit.home === '' || edit.away === '') return
    setSavingResult(s => ({ ...s, [matchId]: true }))

    const homeScore = parseInt(edit.home)
    const awayScore = parseInt(edit.away)

    const { error } = await supabase.from('matches')
      .update({ home_score: homeScore, away_score: awayScore }).eq('id', matchId)

    if (!error) {
      // Trigger points calculation
      await supabase.rpc('calculate_match_points', { p_match_id: matchId })
      await loadAll()
    }
    setSavingResult(s => ({ ...s, [matchId]: false }))
    setResultEdits(e => { const n = { ...e }; delete n[matchId]; return n })
  }

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen msg={error} />

  const matchesWithResults = matches.filter(m => m.home_score !== null).length
  const totalPredictions = predictions.length
  const avgPredPerPlayer = players.length > 0 ? Math.round(totalPredictions / players.length) : 0

  const byPhase = {}
  matches.forEach(m => {
    if (!byPhase[m.phase]) byPhase[m.phase] = []
    byPhase[m.phase].push(m)
  })

  return (
    <>
      <Head>
        <title>Admin: {tournament?.name} | Penca Mundial 2026</title>
      </Head>

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>

        {/* Top bar */}
        <div style={{ background: 'var(--dark-2)', borderBottom: '1px solid var(--border)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="font-display" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>
              ⚙️ Panel Administrador
            </div>
            <h1 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 900 }}>{tournament?.name}</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderRadius: '6px', background: tournament?.is_open ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', border: `1px solid ${tournament?.is_open ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`, color: tournament?.is_open ? '#2ECC71' : '#E74C3C', fontWeight: 700, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.05em' }}>
              {tournament?.is_open ? '🟢 ABIERTA' : '🔴 CERRADA'}
            </div>
            <button className="btn-ghost" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={toggleOpen}>
              {tournament?.is_open ? 'Cerrar registro' : 'Abrir registro'}
            </button>
            <button className="btn-gold" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={copyInvite}>
              {copyMsg || '📤 Copiar invitación'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: '0 1.5rem', display: 'flex', gap: '0' }}>
          {[
            { id: 'dashboard', label: '📊 Dashboard' },
            { id: 'leaderboard', label: '🏆 Ranking' },
            { id: 'results', label: '⚽ Cargar Resultados' },
            { id: 'players', label: `👥 Jugadores (${players.length})` },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '1rem 1.25rem',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--gold)' : 'transparent'}`,
              color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-muted)',
              fontFamily: 'Barlow Condensed, sans-serif',
              fontWeight: 700, fontSize: '0.85rem',
              letterSpacing: '0.05em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '1.5rem', maxWidth: '1000px' }}>

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[
                  { label: 'Participantes', value: players.length, icon: '👥' },
                  { label: 'Partidos cargados', value: `${matchesWithResults}/${matches.length}`, icon: '⚽' },
                  { label: 'Predicciones totales', value: totalPredictions, icon: '🎯' },
                  { label: 'Promedio por jugador', value: avgPredPerPlayer, icon: '📈' },
                ].map((stat, i) => (
                  <div key={i} className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>{stat.icon}</div>
                    <div className="font-display text-gold" style={{ fontSize: '2rem', fontWeight: 900 }}>{stat.value}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Invite link */}
              <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Link de invitación para participantes
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <input readOnly className="input" value={getInviteUrl()} style={{ flex: 1, minWidth: '200px', background: 'var(--dark-4)', cursor: 'text' }} />
                  <button className="btn-gold" onClick={copyInvite}>{copyMsg || 'Copiar'}</button>
                </div>
              </div>

              {/* Admin link reminder */}
              <div className="card" style={{ padding: '1.25rem', borderColor: 'rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.03)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                  <span>🔐</span>
                  <span><strong style={{ color: 'var(--gold)' }}>Tu link de administrador:</strong> {getAdminUrl()} — Guardalo en un lugar seguro, es el único acceso a este panel.</span>
                </div>
              </div>

              {/* Prediction progress per phase */}
              <div style={{ marginTop: '2rem' }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>
                  Partidos por fase
                </div>
                {Object.entries(byPhase).map(([phase, phaseMatches]) => {
                  const withResult = phaseMatches.filter(m => m.home_score !== null).length
                  const mult = phaseMatches[0]?.phase_multiplier
                  return (
                    <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div style={{ width: '120px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: '0.8rem', color: PHASE_COLORS[phase] }}>
                        {PHASE_LABELS[phase]}
                      </div>
                      <div style={{ flex: 1, height: '8px', background: 'var(--dark-4)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: PHASE_COLORS[phase], borderRadius: '4px', width: `${(withResult / phaseMatches.length) * 100}%`, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ width: '80px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>{withResult}/{phaseMatches.length}</div>
                      <div style={{ width: '50px', fontSize: '0.75rem', color: 'var(--gold)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700 }}>×{mult}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* LEADERBOARD TAB */}
          {activeTab === 'leaderboard' && (
            <div>
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Ranking actualizado en tiempo real
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {leaderboard.map((player, idx) => {
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`
                  return (
                    <div key={player.id} className="card" style={{
                      padding: '1rem 1.25rem',
                      display: 'flex', alignItems: 'center', gap: '1rem',
                      borderLeft: idx < 3 ? `3px solid ${['#C9A84C','#888','#CD7F32'][idx]}` : '3px solid transparent',
                    }}>
                      <div className="font-display" style={{ fontSize: '1.25rem', fontWeight: 900, width: '2rem', textAlign: 'center' }}>{medal}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{player.first_name} {player.last_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {player.exactResults} exactos · {player.predicted}/{matches.length} predichos
                        </div>
                      </div>
                      <div>
                        <div className="font-display text-gold" style={{ fontSize: '2rem', fontWeight: 900 }}>{player.totalPoints}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>pts</div>
                      </div>
                    </div>
                  )
                })}
                {leaderboard.length === 0 && (
                  <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Aún no hay participantes en la penca.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RESULTS TAB */}
          {activeTab === 'results' && (
            <div>
              <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span>ℹ️</span>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Cargá el resultado oficial de cada partido. El sistema calculará automáticamente los puntos de todos los participantes.
                </p>
              </div>

              {['groups', 'r16', 'qf', 'sf', 'final'].filter(p => byPhase[p]).map(phase => (
                <div key={phase} style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="font-display" style={{ fontWeight: 800, fontSize: '1rem', color: PHASE_COLORS[phase], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {PHASE_LABELS[phase]}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>×{byPhase[phase][0]?.phase_multiplier} pts</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {byPhase[phase].map(match => {
                      const hasResult = match.home_score !== null
                      const edit = resultEdits[match.id] || {}
                      const dt = new Date(match.match_datetime)
                      const homeFlag = TEAM_FLAGS[match.home_team] || '🏳️'
                      const awayFlag = TEAM_FLAGS[match.away_team] || '🏳️'

                      return (
                        <div key={match.id} className="card" style={{ padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '60px' }}>
                            {dt.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })}
                          </div>

                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '200px' }}>
                            <span className="font-display" style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                              {homeFlag} {match.home_team}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>vs</span>
                            <span className="font-display" style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                              {match.away_team} {awayFlag}
                            </span>
                          </div>

                          {hasResult ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ color: 'var(--green)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: '1.25rem' }}>
                                {match.home_score} - {match.away_score}
                              </span>
                              <button onClick={() => {
                                setResultEdits(e => ({ ...e, [match.id]: { home: match.home_score, away: match.away_score } }))
                                // Clear result to allow re-entry
                                setMatches(ms => ms.map(m => m.id === match.id ? { ...m, home_score: null, away_score: null } : m))
                              }} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✏️</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input type="number" min="0" max="99" placeholder="0"
                                value={edit.home ?? ''}
                                onChange={e => setResultEdits(r => ({ ...r, [match.id]: { ...r[match.id], home: e.target.value } }))}
                                style={{ width: '52px', height: '40px', background: 'var(--dark-4)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.3rem', fontWeight: 800, textAlign: 'center', outline: 'none' }} />
                              <span className="font-display" style={{ color: 'var(--text-muted)', fontWeight: 900 }}>-</span>
                              <input type="number" min="0" max="99" placeholder="0"
                                value={edit.away ?? ''}
                                onChange={e => setResultEdits(r => ({ ...r, [match.id]: { ...r[match.id], away: e.target.value } }))}
                                style={{ width: '52px', height: '40px', background: 'var(--dark-4)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.3rem', fontWeight: 800, textAlign: 'center', outline: 'none' }} />
                              <button className="btn-gold" onClick={() => saveResult(match.id)} disabled={savingResult[match.id]}
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                                {savingResult[match.id] ? '...' : '✓'}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PLAYERS TAB */}
          {activeTab === 'players' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {players.map(player => {
                  const playerPreds = predictions.filter(p => p.player_id === player.id)
                  const totalPts = playerPreds.reduce((s, p) => s + (p.points_awarded || 0), 0)
                  const predicted = playerPreds.filter(p => p.predicted_home !== null).length
                  const playerUrl = typeof window !== 'undefined' ? `${window.location.origin}/predict/${player.token}` : ''

                  return (
                    <div key={player.id} className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{player.first_name} {player.last_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{player.email}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {predicted}/{matches.length} predichos · {totalPts} pts
                        </div>
                      </div>
                      <button className="btn-ghost" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          navigator.clipboard.writeText(playerUrl)
                        }}>
                        📋 Link
                      </button>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(player.created_at).toLocaleDateString('es-UY')}
                      </div>
                    </div>
                  )
                })}
                {players.length === 0 && (
                  <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nadie se ha registrado todavía. Compartí el link de invitación.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '2rem' }}>⚙️</div>
      <div className="font-display" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Cargando panel...</div>
    </div>
  )
}

function ErrorScreen({ msg }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔐</div>
        <p style={{ color: 'var(--text-muted)' }}>{msg}</p>
      </div>
    </div>
  )
}
