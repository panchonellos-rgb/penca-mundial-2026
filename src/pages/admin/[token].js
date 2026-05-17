import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { PHASE_LABELS } from '../../lib/fixture'
import Head from 'next/head'

const PHASE_COLORS = {
  groups: '#3498DB', r16: '#2ECC71', qf: '#C9A84C', sf: '#E74C3C', final: '#9B59B6'
}

const TEAM_FLAGS = {
  MEX:'🇲🇽',SUD:'🇿🇦',KOR:'🇰🇷',CZE:'🇨🇿',CAN:'🇨🇦',BIH:'🇧🇦',USA:'🇺🇸',PAR:'🇵🇾',
  QAT:'🇶🇦',SUI:'🇨🇭',BRA:'🇧🇷',MAR:'🇲🇦',HAI:'🇭🇹',ESC:'🏴󠁧󠁢󠁳󠁣󠁴󠁿',AUS:'🇦🇺',TUR:'🇹🇷',
  ALE:'🇩🇪',CUR:'🇨🇼',NED:'🇳🇱',JAP:'🇯🇵',CIV:'🇨🇮',ECU:'🇪🇨',SUE:'🇸🇪',TUN:'🇹🇳',
  ESP:'🇪🇸',CPV:'🇨🇻',BEL:'🇧🇪',EGP:'🇪🇬',KSA:'🇸🇦',URU:'🇺🇾',IRN:'🇮🇷',NZL:'🇳🇿',
  FRA:'🇫🇷',SEN:'🇸🇳',IRQ:'🇮🇶',NOR:'🇳🇴',ARG:'🇦🇷',ALG:'🇩🇿',JOR:'🇯🇴',POR:'🇵🇹',
  COD:'🇨🇩',ING:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',CRO:'🇭🇷',GHA:'🇬🇭',PAN:'🇵🇦',UZB:'🇺🇿',COL:'🇨🇴',JPN:'🇯🇵',EGY:'🇪🇬',
}
const ALL_TEAMS = Object.keys(TEAM_FLAGS)

const KNOCKOUT_PHASES = [
  { phase: 'r16',   label: '16avos de Final',    multiplier: 2  },
  { phase: 'qf',    label: 'Cuartos de Final',   multiplier: 4  },
  { phase: 'sf',    label: 'Semifinales',         multiplier: 8  },
  { phase: 'final', label: 'Final + 3° puesto',  multiplier: 16 },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function flag(team) { return TEAM_FLAGS[team] || '🏳️' }

function fmt(iso) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
  }
}

function categorizePred(pred, match) {
  if (match.home_score === null || match.home_score === undefined) return null
  const exactResult  = pred.predicted_home === match.home_score && pred.predicted_away === match.away_score
  const correctWinner =
    (pred.predicted_home > pred.predicted_away && match.home_score > match.away_score) ||
    (pred.predicted_home < pred.predicted_away && match.home_score < match.away_score) ||
    (pred.predicted_home === pred.predicted_away && match.home_score === match.away_score)
  const exactHome = pred.predicted_home === match.home_score
  const exactAway = pred.predicted_away === match.away_score
  const pts       = pred.points_awarded || 0
  return { exactResult, correctWinner, exactHome, exactAway, pts }
}

function buildReport(player, predictions, matches) {
  const preds        = predictions.filter(p => p.player_id === player.id)
  const playedMatches = matches.filter(m => m.home_score !== null)
  let totalPoints = 0, exactResults = 0, correctWinners = 0, exactHomeGoals = 0, exactAwayGoals = 0
  const details = []

  for (const match of playedMatches) {
    const pred = preds.find(p => p.match_id === match.id) || null
    const cat  = pred ? categorizePred(pred, match) : null
    if (cat) {
      totalPoints   += cat.pts
      if (cat.exactResult)                        exactResults++
      if (!cat.exactResult && cat.correctWinner)  correctWinners++
      if (!cat.exactResult && cat.exactHome)      exactHomeGoals++
      if (!cat.exactResult && cat.exactAway)      exactAwayGoals++
    }
    details.push({ match, pred, cat })
  }

  return {
    ...player,
    totalPoints, exactResults, correctWinners, exactHomeGoals, exactAwayGoals,
    totalPredicted: preds.length,
    totalMatches:   matches.length,
    details,
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter()
  const { token } = router.query

  const [tournament, setTournament]     = useState(null)
  const [players, setPlayers]           = useState([])
  const [matches, setMatches]           = useState([])
  const [predictions, setPredictions]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [activeTab, setActiveTab]       = useState('dashboard')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [resultEdits, setResultEdits]   = useState({})
  const [savingResult, setSavingResult] = useState({})
  const [copyMsg, setCopyMsg]           = useState('')
  const [bracketPhase, setBracketPhase] = useState('r16')
  const [bracketRows, setBracketRows]   = useState([{ home: '', away: '', datetime: '' }])
  const [savingBracket, setSavingBracket] = useState(false)
  const [bracketMsg, setBracketMsg]     = useState('')

  useEffect(() => { if (token) loadAll() }, [token])

  async function loadAll() {
    setLoading(true)
    const { data: t, error: tErr } = await supabase
      .from('tournaments').select('*').eq('admin_token', token).single()
    if (tErr || !t) { setError('Acceso denegado.'); setLoading(false); return }
    setTournament(t)

    const { data: pIds } = await supabase.from('players').select('id').eq('tournament_id', t.id)
    const ids = pIds?.map(p => p.id) || []

    const [pR, mR, prR] = await Promise.all([
      supabase.from('players').select('*').eq('tournament_id', t.id).order('created_at'),
      supabase.from('matches').select('*').eq('tournament_id', t.id).order('match_number'),
      ids.length ? supabase.from('predictions').select('*').in('player_id', ids) : { data: [] },
    ])
    setPlayers(pR.data || [])
    setMatches(mR.data || [])
    setPredictions(prR.data || [])
    setLoading(false)
  }

  const reports  = players.map(p => buildReport(p, predictions, matches)).sort((a, b) => b.totalPoints - a.totalPoints)
  const byPhase  = {}
  matches.forEach(m => { if (!byPhase[m.phase]) byPhase[m.phase] = []; byPhase[m.phase].push(m) })
  const confirmedPhases = new Set(matches.filter(m => m.phase !== 'groups' && m.teams_confirmed).map(m => m.phase))

  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/invite/${tournament?.invite_token}` : ''
  const adminUrl  = typeof window !== 'undefined' ? window.location.href : ''

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => { setCopyMsg('¡Copiado!'); setTimeout(() => setCopyMsg(''), 2500) })
  }

  async function toggleOpen() {
    await supabase.from('tournaments').update({ is_open: !tournament.is_open }).eq('id', tournament.id)
    setTournament(t => ({ ...t, is_open: !t.is_open }))
  }

  async function saveResult(matchId) {
    const edit = resultEdits[matchId]
    if (!edit || edit.home === '' || edit.away === '') return
    setSavingResult(s => ({ ...s, [matchId]: true }))
    await supabase.from('matches').update({ home_score: parseInt(edit.home), away_score: parseInt(edit.away) }).eq('id', matchId)
    await supabase.rpc('calculate_match_points', { p_match_id: matchId })
    setSavingResult(s => ({ ...s, [matchId]: false }))
    setResultEdits(e => { const n = { ...e }; delete n[matchId]; return n })
    await loadAll()
  }

  async function saveBracket() {
    const valid = bracketRows.filter(r => r.home && r.away && r.datetime)
    if (!valid.length) { setBracketMsg('Completá al menos un cruce con fecha.'); return }
    setSavingBracket(true)
    setBracketMsg('')
    const phaseInfo = KNOCKOUT_PHASES.find(p => p.phase === bracketPhase)

    // Delete TBD unconfirmed matches for this phase
    await supabase.from('matches').delete()
      .eq('tournament_id', tournament.id).eq('phase', bracketPhase).eq('teams_confirmed', false)

    const baseNum = { r16: 200, qf: 300, sf: 400, final: 500 }[bracketPhase] || 200
    const toInsert = valid.map((r, i) => ({
      tournament_id: tournament.id,
      match_number:  baseNum + i,
      phase:         bracketPhase,
      phase_multiplier: phaseInfo.multiplier,
      match_datetime: new Date(r.datetime).toISOString(),
      home_team:     r.home.toUpperCase(),
      away_team:     r.away.toUpperCase(),
      is_tbd:        false,
      teams_confirmed: true,
    }))

    const { error } = await supabase.from('matches').insert(toInsert)
    setSavingBracket(false)
    if (error) { setBracketMsg('Error: ' + error.message); return }
    setBracketMsg(`✅ ${valid.length} cruce(s) guardado(s).`)
    setBracketRows([{ home: '', away: '', datetime: '' }])
    await loadAll()
  }

  if (loading) return <Screen icon="⚙️" msg="Cargando panel..." />
  if (error)   return <Screen icon="🔐" msg={error} />

  const matchesWithResults = matches.filter(m => m.home_score !== null).length

  return (
    <>
      <Head><title>Admin: {tournament?.name} | Penca Mundial 2026</title></Head>
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>

        {/* Top bar */}
        <div style={{ background: 'var(--dark-2)', borderBottom: '1px solid var(--border)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="font-display" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>⚙️ Panel Administrador</div>
            <h1 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 900 }}>{tournament?.name}</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderRadius: '6px', background: tournament?.is_open ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', border: `1px solid ${tournament?.is_open ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`, color: tournament?.is_open ? '#2ECC71' : '#E74C3C', fontWeight: 700, fontFamily: 'Barlow Condensed,sans-serif' }}>
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
        <div style={{ borderBottom: '1px solid var(--border)', padding: '0 1.5rem', display: 'flex', overflowX: 'auto' }}>
          {[
            { id: 'dashboard',   label: '📊 Dashboard' },
            { id: 'leaderboard', label: '🏆 Ranking' },
            { id: 'report',      label: `📋 Reporte (${players.length})` },
            { id: 'results',     label: '⚽ Resultados' },
            { id: 'brackets',    label: '🗂️ Cruces' },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedPlayer(null) }} style={{
              whiteSpace: 'nowrap', padding: '1rem 1.25rem', background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--gold)' : 'transparent'}`,
              color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-muted)',
              fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700, fontSize: '0.85rem',
              letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s',
            }}>{tab.label}</button>
          ))}
        </div>

        <div style={{ padding: '1.5rem', maxWidth: '1000px' }}>

          {/* ══ DASHBOARD ══ */}
          {activeTab === 'dashboard' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[
                  { label: 'Participantes',        value: players.length,                          icon: '👥' },
                  { label: 'Resultados cargados',  value: `${matchesWithResults}/${matches.length}`, icon: '⚽' },
                  { label: 'Total predicciones',   value: predictions.length,                       icon: '🎯' },
                  { label: 'Líder actual',         value: reports[0] ? `${reports[0].first_name} ${reports[0].last_name[0]}.` : '—', icon: '🥇' },
                ].map((s, i) => (
                  <div key={i} className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>{s.icon}</div>
                    <div className="font-display text-gold" style={{ fontSize: i === 3 ? '1.1rem' : '2rem', fontWeight: 900 }}>{s.value}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                <Label>Link de invitación</Label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <input readOnly className="input" value={inviteUrl} style={{ flex: 1, minWidth: '200px', cursor: 'text' }} />
                  <button className="btn-gold" onClick={copyInvite}>{copyMsg || 'Copiar'}</button>
                </div>
              </div>

              <div className="card" style={{ padding: '1rem', borderColor: 'rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.03)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                  <span>🔐</span>
                  <span><strong style={{ color: 'var(--gold)' }}>Tu link admin (guardalo):</strong> {adminUrl}</span>
                </div>
              </div>

              <div style={{ marginTop: '2rem' }}>
                <Label>Partidos por fase</Label>
                {Object.entries(byPhase).map(([phase, pm]) => {
                  const done = pm.filter(m => m.home_score !== null).length
                  return (
                    <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div style={{ width: '130px', fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700, fontSize: '0.8rem', color: PHASE_COLORS[phase] }}>{PHASE_LABELS[phase]}</div>
                      <div style={{ flex: 1, height: '8px', background: 'var(--dark-4)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: PHASE_COLORS[phase], width: `${(done / pm.length) * 100}%`, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ width: '60px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>{done}/{pm.length}</div>
                      <div style={{ width: '40px', fontSize: '0.75rem', color: 'var(--gold)', fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700 }}>×{pm[0]?.phase_multiplier}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══ RANKING ══ */}
          {activeTab === 'leaderboard' && (
            <div>
              <Label>Tabla de posiciones en tiempo real</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {reports.map((r, idx) => {
                  const medal = ['🥇','🥈','🥉'][idx] || `${idx + 1}`
                  const bc = ['#C9A84C','#888','#CD7F32'][idx] || 'transparent'
                  return (
                    <div key={r.id} className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: `3px solid ${bc}` }}>
                      <div className="font-display" style={{ fontSize: '1.25rem', fontWeight: 900, width: '2rem', textAlign: 'center' }}>{medal}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                          <span>🎯 {r.exactResults} exactos</span>
                          <span>✅ {r.correctWinners} ganadores</span>
                          <span>⚽ {r.exactHomeGoals + r.exactAwayGoals} goles</span>
                          <span>📋 {r.totalPredicted}/{r.totalMatches} predichos</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="font-display text-gold" style={{ fontSize: '2rem', fontWeight: 900 }}>{r.totalPoints}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>pts</div>
                      </div>
                    </div>
                  )
                })}
                {reports.length === 0 && <Empty msg="Sin participantes aún." />}
              </div>
            </div>
          )}

          {/* ══ REPORTE JUGADORES ══ */}
          {activeTab === 'report' && !selectedPlayer && (
            <div>
              <Label>Reporte de competidores — click para ver detalle</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {reports.map((r, idx) => (
                  <button key={r.id} onClick={() => setSelectedPlayer(r)} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                    <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'border-color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = ''}>
                      <div className="font-display" style={{ fontSize: '1.1rem', fontWeight: 900, width: '2rem', color: 'var(--text-muted)' }}>#{idx + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{r.first_name} {r.last_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.email}</div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                          <Chip color="#C9A84C" label={`🎯 ${r.exactResults} exactos`} />
                          <Chip color="#2ECC71" label={`✅ ${r.correctWinners} ganadores`} />
                          <Chip color="#3498DB" label={`⚽ ${r.exactHomeGoals + r.exactAwayGoals} goles`} />
                          <Chip color="#888"    label={`📋 ${r.totalPredicted}/${r.totalMatches}`} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="font-display text-gold" style={{ fontSize: '1.8rem', fontWeight: 900 }}>{r.totalPoints}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>pts</div>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>›</div>
                    </div>
                  </button>
                ))}
                {reports.length === 0 && <Empty msg="Sin participantes aún." />}
              </div>
            </div>
          )}

          {/* ── Player detail ── */}
          {activeTab === 'report' && selectedPlayer && (
            <PlayerDetail report={selectedPlayer} matches={matches} onBack={() => setSelectedPlayer(null)} />
          )}

          {/* ══ RESULTADOS ══ */}
          {activeTab === 'results' && (
            <div>
              <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                <span>ℹ️</span>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ingresá el resultado oficial. Los puntos se calculan automáticamente al guardar.</p>
              </div>
              {['groups','r16','qf','sf','final'].filter(p => byPhase[p]).map(phase => (
                <div key={phase} style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="font-display" style={{ fontWeight: 800, fontSize: '1rem', color: PHASE_COLORS[phase], textTransform: 'uppercase' }}>{PHASE_LABELS[phase]}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>×{byPhase[phase][0]?.phase_multiplier}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {byPhase[phase].map(match => {
                      const hasResult = match.home_score !== null
                      const edit = resultEdits[match.id] || {}
                      const { date, time } = fmt(match.match_datetime)
                      return (
                        <div key={match.id} className="card" style={{ padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '70px' }}>
                            <div>{date}</div><div style={{ fontWeight: 700 }}>{time}</div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '180px' }}>
                            <span className="font-display" style={{ fontWeight: 800 }}>{flag(match.home_team)} {match.home_team}</span>
                            <span style={{ color: 'var(--text-muted)' }}>vs</span>
                            <span className="font-display" style={{ fontWeight: 800 }}>{match.away_team} {flag(match.away_team)}</span>
                          </div>
                          {hasResult ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ color: 'var(--green)', fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 900, fontSize: '1.4rem' }}>
                                {match.home_score} — {match.away_score}
                              </span>
                              <button onClick={() => {
                                setResultEdits(e => ({ ...e, [match.id]: { home: match.home_score, away: match.away_score } }))
                                setMatches(ms => ms.map(m => m.id === match.id ? { ...m, home_score: null, away_score: null } : m))
                              }} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✏️ editar</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <SInput value={edit.home ?? ''} onChange={v => setResultEdits(r => ({ ...r, [match.id]: { ...r[match.id], home: v } }))} />
                              <span className="font-display" style={{ color: 'var(--text-muted)', fontWeight: 900 }}>—</span>
                              <SInput value={edit.away ?? ''} onChange={v => setResultEdits(r => ({ ...r, [match.id]: { ...r[match.id], away: v } }))} />
                              <button className="btn-gold" onClick={() => saveResult(match.id)} disabled={savingResult[match.id]} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                                {savingResult[match.id] ? '...' : '✓ Guardar'}
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

          {/* ══ CRUCES ══ */}
          {activeTab === 'brackets' && (
            <div>
              <Label>Configurar cruces eliminatorios</Label>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Cuando conozcas los clasificados, cargá los cruces de cada fase. Los jugadores podrán apostar estos partidos de inmediato.
              </p>

              {/* Already confirmed phases */}
              {['r16','qf','sf','final'].filter(p => byPhase[p]?.some(m => m.teams_confirmed)).map(phase => (
                <div key={phase} className="card" style={{ padding: '1rem 1.25rem', marginBottom: '0.75rem', borderLeft: `3px solid ${PHASE_COLORS[phase]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div className="font-display" style={{ fontWeight: 800, color: PHASE_COLORS[phase], textTransform: 'uppercase', fontSize: '0.9rem' }}>
                      {PHASE_LABELS[phase]} — {byPhase[phase].filter(m => m.teams_confirmed).length} partidos
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--green)' }}>✅ Confirmada</span>
                  </div>
                  {byPhase[phase].filter(m => m.teams_confirmed).map(m => (
                    <div key={m.id} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', marginBottom: '0.2rem' }}>
                      <span>{flag(m.home_team)} {m.home_team} vs {m.away_team} {flag(m.away_team)}</span>
                      <span style={{ marginLeft: 'auto' }}>{fmt(m.match_datetime).date} {fmt(m.match_datetime).time}</span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Builder */}
              <div className="card-elevated" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <Label>Fase</Label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {KNOCKOUT_PHASES.map(kp => (
                      <button key={kp.phase} onClick={() => { setBracketPhase(kp.phase); setBracketRows([{ home: '', away: '', datetime: '' }]); setBracketMsg('') }} style={{
                        padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
                        border: `1px solid ${bracketPhase === kp.phase ? PHASE_COLORS[kp.phase] : 'var(--border)'}`,
                        background: bracketPhase === kp.phase ? `${PHASE_COLORS[kp.phase]}22` : 'transparent',
                        color: bracketPhase === kp.phase ? PHASE_COLORS[kp.phase] : 'var(--text-muted)',
                        fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700, fontSize: '0.8rem',
                        textTransform: 'uppercase', transition: 'all 0.2s',
                      }}>
                        {kp.label}
                        {confirmedPhases.has(kp.phase) && <span style={{ marginLeft: '0.4rem', color: 'var(--green)' }}>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr 190px 28px', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <Label style={{ margin: 0 }}>Local</Label><div /><Label style={{ margin: 0 }}>Visitante</Label><Label style={{ margin: 0 }}>Fecha/hora (hora UY)</Label><div />
                </div>

                {bracketRows.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr 190px 28px', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <select value={r.home} onChange={e => setBracketRows(br => br.map((x, j) => j === i ? { ...x, home: e.target.value } : x))} className="input" style={{ padding: '0.5rem' }}>
                      <option value="">— Equipo —</option>
                      {ALL_TEAMS.map(t => <option key={t} value={t}>{flag(t)} {t}</option>)}
                    </select>
                    <span className="font-display" style={{ color: 'var(--text-muted)', fontWeight: 900, textAlign: 'center' }}>vs</span>
                    <select value={r.away} onChange={e => setBracketRows(br => br.map((x, j) => j === i ? { ...x, away: e.target.value } : x))} className="input" style={{ padding: '0.5rem' }}>
                      <option value="">— Equipo —</option>
                      {ALL_TEAMS.map(t => <option key={t} value={t}>{flag(t)} {t}</option>)}
                    </select>
                    <input type="datetime-local" value={r.datetime} onChange={e => setBracketRows(br => br.map((x, j) => j === i ? { ...x, datetime: e.target.value } : x))} className="input" style={{ padding: '0.5rem', fontSize: '0.85rem' }} />
                    <button onClick={() => setBracketRows(br => br.length > 1 ? br.filter((_, j) => j !== i) : br)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' }}>✕</button>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.75rem' }}>
                  <button className="btn-ghost" onClick={() => setBracketRows(br => [...br, { home: '', away: '', datetime: '' }])} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>+ Agregar cruce</button>
                  <button className="btn-gold" onClick={saveBracket} disabled={savingBracket} style={{ padding: '0.6rem 1.5rem' }}>
                    {savingBracket ? 'Guardando...' : '💾 Confirmar cruces'}
                  </button>
                  {bracketMsg && <span style={{ fontSize: '0.85rem', color: bracketMsg.startsWith('✅') ? 'var(--green)' : '#E74C3C' }}>{bracketMsg}</span>}
                </div>

                <div className="card" style={{ marginTop: '1.25rem', padding: '0.875rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                    <span>⚠️</span>
                    <span>Al confirmar se reemplazan los cruces TBD de esta fase. Los jugadores verán los nuevos partidos inmediatamente en su penca.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

// ── Player Detail ─────────────────────────────────────────────────────────────

function PlayerDetail({ report, matches, onBack }) {
  const [fPhase, setFPhase] = useState('all')
  const [fType,  setFType]  = useState('all')

  const usedPhases = [...new Set(report.details.map(d => d.match.phase))]

  const filtered = report.details.filter(d => {
    if (d.match.home_score === null) return false
    if (fPhase !== 'all' && d.match.phase !== fPhase) return false
    if (fType === 'exact'  && !d.cat?.exactResult)                    return false
    if (fType === 'winner' && (!d.cat?.correctWinner || d.cat?.exactResult)) return false
    if (fType === 'missed' && d.cat?.pts > 0)                         return false
    if (fType === 'nopred' && d.pred !== null)                        return false
    return true
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={onBack} className="btn-ghost" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>← Volver</button>
        <div>
          <h2 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 900 }}>{report.first_name} {report.last_name}</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{report.email}</div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { icon: '🏆', label: 'Puntos totales',      value: report.totalPoints,                            color: 'var(--gold)' },
          { icon: '🎯', label: 'Resultado exacto',     value: report.exactResults,                          color: '#C9A84C' },
          { icon: '✅', label: 'Ganador correcto',     value: report.correctWinners,                        color: '#2ECC71' },
          { icon: '⚽', label: 'Goles local exactos',  value: report.exactHomeGoals,                        color: '#3498DB' },
          { icon: '⚽', label: 'Goles visita exactos', value: report.exactAwayGoals,                        color: '#3498DB' },
          { icon: '📋', label: 'Predichos',            value: `${report.totalPredicted}/${report.totalMatches}`, color: '#888' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem' }}>{s.icon}</div>
            <div className="font-display" style={{ fontSize: '1.5rem', fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          { v: 'all',    l: 'Todos' },
          { v: 'exact',  l: '🎯 Exactos' },
          { v: 'winner', l: '✅ Ganador' },
          { v: 'missed', l: '❌ Sin puntos' },
          { v: 'nopred', l: '⬜ Sin pred.' },
        ].map(f => (
          <FBtn key={f.v} active={fType === f.v} color="var(--gold)" onClick={() => setFType(f.v)}>{f.l}</FBtn>
        ))}
        <div style={{ width: '1px', background: 'var(--border)', margin: '0 0.2rem' }} />
        <FBtn active={fPhase === 'all'} color="var(--text-muted)" onClick={() => setFPhase('all')}>Todas</FBtn>
        {usedPhases.map(ph => (
          <FBtn key={ph} active={fPhase === ph} color={PHASE_COLORS[ph]} onClick={() => setFPhase(ph)}>{PHASE_LABELS[ph]}</FBtn>
        ))}
      </div>

      {/* Match rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {filtered.map(({ match, pred, cat }) => {
          const { date, time } = fmt(match.match_datetime)
          const noPred  = !pred
          const rowCol  = noPred ? 'var(--border)' : cat.exactResult ? '#C9A84C' : cat.pts > 0 ? '#2ECC71' : '#E74C3C'
          return (
            <div key={match.id} className="card" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', borderLeft: `3px solid ${rowCol}` }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '65px' }}>
                <div>{date}</div><div style={{ fontWeight: 700 }}>{time}</div>
              </div>

              <div style={{ flex: 1, minWidth: '190px' }}>
                <div className="font-display" style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  {flag(match.home_team)} {match.home_team}
                  <span style={{ color: 'var(--gold)', margin: '0 0.5rem' }}>{match.home_score} — {match.away_score}</span>
                  {match.away_team} {flag(match.away_team)}
                </div>
                <div style={{ fontSize: '0.7rem', color: PHASE_COLORS[match.phase], fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700, textTransform: 'uppercase' }}>
                  {PHASE_LABELS[match.phase]} ×{match.phase_multiplier}
                </div>
              </div>

              <div style={{ textAlign: 'center', minWidth: '80px' }}>
                {noPred
                  ? <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin predicción</div>
                  : <>
                      <div className="font-display" style={{ fontWeight: 900, fontSize: '1.1rem' }}>{pred.predicted_home} — {pred.predicted_away}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>predicción</div>
                    </>
                }
              </div>

              {!noPred && (
                <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: '150px' }}>
                  {cat.exactResult                         && <span style={{ color: '#C9A84C' }}>🎯 Resultado exacto</span>}
                  {!cat.exactResult && cat.correctWinner   && <span style={{ color: '#2ECC71' }}>✅ Ganador correcto</span>}
                  {!cat.exactResult && cat.exactHome       && <span style={{ color: '#3498DB' }}>⚽ Goles local exactos</span>}
                  {!cat.exactResult && cat.exactAway       && <span style={{ color: '#3498DB' }}>⚽ Goles visita exactos</span>}
                  {cat.pts === 0                           && <span style={{ color: '#E74C3C' }}>❌ Sin aciertos</span>}
                </div>
              )}

              <div style={{ textAlign: 'right', minWidth: '48px' }}>
                <div className="font-display" style={{ fontSize: '1.4rem', fontWeight: 900, color: noPred ? 'var(--text-muted)' : cat.pts > 0 ? 'var(--gold)' : '#E74C3C' }}>
                  {noPred ? '—' : cat.pts}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>pts</div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <Empty msg="Ningún partido coincide con el filtro." />}
      </div>
    </div>
  )
}

// ── Micro-components ──────────────────────────────────────────────────────────

function Label({ children, style }) {
  return <div className="font-display" style={{ fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem', ...style }}>{children}</div>
}
function Chip({ color, label }) {
  return <span style={{ fontSize: '0.72rem', color, background: `${color}18`, padding: '0.15rem 0.5rem', borderRadius: '4px', border: `1px solid ${color}44`, fontWeight: 600 }}>{label}</span>
}
function FBtn({ children, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', border: `1px solid ${active ? color : 'var(--border)'}`, background: active ? `${color}22` : 'transparent', color: active ? color : 'var(--text-muted)', fontFamily: 'Barlow Condensed,sans-serif', fontWeight: 700, transition: 'all 0.15s' }}>
      {children}
    </button>
  )
}
function SInput({ value, onChange }) {
  return <input type="number" min="0" max="99" placeholder="0" value={value} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} style={{ width: '52px', height: '42px', background: 'var(--dark-4)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontFamily: 'Barlow Condensed,sans-serif', fontSize: '1.4rem', fontWeight: 800, textAlign: 'center', outline: 'none' }} />
}
function Empty({ msg }) {
  return <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>{msg}</div>
}
function Screen({ icon, msg }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}><div style={{ fontSize: '2rem' }}>{icon}</div><div className="font-display" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{msg}</div></div>
}
