import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Head from 'next/head'

function generateToken(len = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function InvitePage() {
  const router = useRouter()
  const { token } = router.query

  const [tournament, setTournament] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [done, setDone] = useState(null) // player token after register

  useEffect(() => {
    if (!token) return
    supabase
      .from('tournaments')
      .select('*')
      .eq('invite_token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError('Link de invitación inválido o expirado.')
        else if (!data.is_open) setError('Esta penca ya cerró el registro de predicciones.')
        else setTournament(data)
        setLoading(false)
      })
  }, [token])

  async function handleRegister(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const playerToken = generateToken(20)
    const { data, error: pErr } = await supabase
      .from('players')
      .insert({
        tournament_id: tournament.id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        token: playerToken,
      })
      .select()
      .single()

    if (pErr) {
      if (pErr.code === '23505') setError('Ya existe un jugador con ese email en esta penca.')
      else setError(pErr.message)
      setSaving(false)
      return
    }

    // Redirect to predictions page
    router.push(`/predict/${playerToken}`)
  }

  if (loading) return <LoadingScreen />

  return (
    <>
      <Head>
        <title>{tournament ? `${tournament.name} - Penca Mundial 2026` : 'Penca Mundial 2026'}</title>
      </Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', zIndex: 1 }}>
        <div style={{ width: '100%', maxWidth: '460px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} className="animate-fade-up">
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚽</div>
            <div className="font-display text-gold" style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Penca Mundial 2026
            </div>
            {tournament && (
              <h1 className="font-display" style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                {tournament.name}
              </h1>
            )}
          </div>

          {error && !tournament && (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#E74C3C' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
              <p>{error}</p>
            </div>
          )}

          {tournament && (
            <div className="card-elevated animate-fade-up stagger-2" style={{ padding: '2.5rem' }}>
              <h2 className="font-display" style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Registrarse
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Completá tu perfil para acceder a las predicciones. Tenés hasta el inicio del torneo para completarlas.
              </p>

              <form onSubmit={handleRegister}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label className="label">Nombre</label>
                    <input className="input" type="text" placeholder="Juan" required
                      value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Apellido</label>
                    <input className="input" type="text" placeholder="Pérez" required
                      value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label className="label">Correo electrónico</label>
                  <input className="input" type="email" placeholder="juan@ejemplo.com" required
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>

                {error && (
                  <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#E74C3C', fontSize: '0.875rem', marginBottom: '1rem' }}>
                    {error}
                  </div>
                )}

                <button className="btn-gold" type="submit" disabled={saving} style={{ width: '100%' }}>
                  {saving ? 'Registrando...' : '🎯 Ir a mis predicciones'}
                </button>
              </form>

              <div className="card" style={{ marginTop: '1.5rem', padding: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span>🔑</span>
                  <span>Guardá el link de predicciones que te daremos — es tu acceso personal para completar o modificar tus apuestas antes del inicio del torneo.</span>
                </div>
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
      <div style={{ fontSize: '2rem' }}>⚽</div>
      <div className="font-display" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Cargando...</div>
    </div>
  )
}
