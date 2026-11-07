import React, { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { LockKeyhole, Mail, ArrowRight, LogOut, ShieldCheck } from 'lucide-react'
import './auth.css'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setError(error.message)
      setSession(data?.session ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
    setBusy(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (loading) {
    return <div className="continuum-auth-screen"><div className="continuum-auth-card"><div className="continuum-auth-mark">c.</div><p>Preparing your workspace…</p></div></div>
  }

  if (!session) {
    return (
      <div className="continuum-auth-screen">
        <form className="continuum-auth-card" onSubmit={signIn}>
          <div className="continuum-auth-mark">c.</div>
          <div className="continuum-auth-eyebrow">CARE, CONNECTED.</div>
          <h1>Welcome back.</h1>
          <p className="continuum-auth-copy">Sign in to continue to your Continuum workspace.</p>
          <label className="continuum-auth-label">Email address</label>
          <div className="continuum-auth-input"><Mail size={17}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
          <label className="continuum-auth-label">Password</label>
          <div className="continuum-auth-input"><LockKeyhole size={17}/><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required /></div>
          {error && <div className="continuum-auth-error" role="alert">{error}</div>}
          <button className="continuum-auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16}/></button>
          <div className="continuum-auth-safe"><ShieldCheck size={14}/> Secure sign-in powered by Supabase</div>
        </form>
      </div>
    )
  }

  return (
    <>
      <div className="continuum-session-bar">
        <span>Signed in as <b>{session.user.email}</b></span>
        <button onClick={signOut}><LogOut size={14}/> Sign out</button>
      </div>
      {children}
    </>
  )
}
