import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { MATCHES_FIXTURE } from '../lib/fixture'
import Head from 'next/head'

function generateToken(len = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) + '-' + generateToken(4)
}

export default function Home() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    try {
      const slug = generateSlug(name)
      const adminToken = generateToken(20)
      const inviteToken = generateToken(16)

      // Create tournament
      const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .insert({ name: name.trim(), slug, admin_token: adminToken, invite_token: inviteToken })
        .select()
        .single()

      if (tErr) throw tErr

      // Insert all matches
      const matchesData = MATCHES_FIXTURE.map(m => ({
        ...m,
        tournament_id: tournament.id,
        home_flag: undefined,
        away_flag: undefined,
      }))
      // Remove client-only flag fields
      const cleanMatches = MATCHES_FIXTURE.map(({ home_flag, away_flag, ...m }) => ({
        ...m,
        tournament_id: tournament.id,
      }))

      const { error: mErr } = await supabase.from('matches').insert(cleanMatches)
      if (mErr) throw mErr

      // Redirect to admin dashboard
      router.push(`/admin/${adminToken}`)
    } catch (err) {
      setError(err.message || 'Error al crear el torneo')
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Penca Mundial 2026</title>
        <meta name="description" content="Armá tu penca del Mundial FIFA 2026" />
      </Head>

      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', zIndex: 1 }}>

        {/* Background glow */}
        <div style={{
          position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '400px',
          background: 'radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }} className="animate-fade-up">
          <div style={{ marginBottom: '1rem' }}>
            <span style={{ fontSize: '4rem' }}>⚽</span>
          </div>
          <h1 className="font-display text-gold" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '0.5rem' }}>
            PENCA MUNDIAL
          </h1>
          <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.3em' }}>
            2026
          </div>
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontSize: '1rem' }}>
            104 partidos. Un ganador. Tu predicción completa.
          </p>
        </div>

        {/* Create form */}
        <div className="card-elevated animate-fade-up stagger-2" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Crear nueva penca
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Ingresá el nombre de tu grupo y generá los links de invitación
          </p>

          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="label">Nombre del torneo</label>
              <input
                className="input"
                type="text"
                placeholder="Ej: Oficina Marketing, Amigos del barrio..."
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={60}
                required
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#E74C3C', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button className="btn-gold" type="submit" disabled={loading} style={{ width: '100%', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Creando...' : '⚡ Crear Penca'}
            </button>
          </form>
        </div>

        {/* Features */}
        <div className="animate-fade-up stagger-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '3rem', maxWidth: '520px', width: '100%' }}>
          {[
            { icon: '📋', label: '71 partidos', sub: 'Fase de grupos' },
            { icon: '🏆', label: 'Puntos dobles', sub: 'Rondas eliminatorias' },
            { icon: '📊', label: 'Dashboard', sub: 'Ranking en vivo' },
          ].map((f, i) => (
            <div key={i} className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{f.icon}</div>
              <div className="font-display" style={{ fontWeight: 700, fontSize: '0.9rem' }}>{f.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{f.sub}</div>
            </div>
          ))}
        </div>

        {/* Scoring legend */}
        <div className="animate-fade-up stagger-4" style={{ marginTop: '2rem', maxWidth: '520px', width: '100%' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div className="font-display" style={{ fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Sistema de puntuación (× multiplicador de fase)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Resultado exacto</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>5 pts</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ganador correcto</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>2 pts</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Goles exactos (c/u)</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>1 pt</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>16avos × 2, QF × 4...</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>↑↑↑</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
