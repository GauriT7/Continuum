import React, { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { LockKeyhole, Mail, ArrowRight, LogOut, ShieldCheck, Eye } from 'lucide-react'
import './auth.css'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [guestMode, setGuestMode] = useState(false)
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
    }).catch((err) => {
      if (!alive) return
      setError('Secure sign-in is temporarily unavailable. You can still explore the guest demo.')
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
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setError(error.message)
    } catch {
      setError('Unable to reach secure sign-in. Please try again or enter the guest demo.')
    } finally {
      setBusy(false)
    }
  }

  function enterGuestDemo() {
    setError('')
    setGuestMode(true)
  }

  async function signOut() {
    if (guestMode) {
      setGuestMode(false)
      return
    }
    await supabase.auth.signOut()
  }

  if (loading) {
    return <div className="continuum-auth-screen"><div className="continuum-auth-card"><div className="continuum-auth-mark">c.</div><p>Preparing your workspace…</p></div></div>
  }

  if (!session && !guestMode) {
    return (
      <div className="continuum-auth-screen">
        <div className="continuum-auth-card">
          <div className="continuum-auth-mark">c.</div>
          <div className="continuum-auth-eyebrow">CARE, CONNECTED.</div>
          <h1>Welcome to Continuum.</h1>
          <p className="continuum-auth-copy">Explore a connected maternal-health workflow, or sign in to your secure staff workspace.</p>

          <button className="continuum-auth-guest" type="button" onClick={enterGuestDemo}>
            <Eye size={17}/> Explore as guest <ArrowRight size={16}/>
          </button>
          <div className="continuum-auth-demo-note"><ShieldCheck size={14}/> Interactive demo · Fictional records · No messages or calls are sent</div>

          <div className="continuum-auth-divider"><span>STAFF ACCESS</span></div>
          <form onSubmit={signIn}>
            <label className="continuum-auth-label">Email address</label>
            <div className="continuum-auth-input"><Mail size={17}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
            <label className="continuum-auth-label">Password</label>
            <div className="continuum-auth-input"><LockKeyhole size={17}/><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required /></div>
            {error && <div className="continuum-auth-error" role="alert">{error}</div>}
            <button className="continuum-auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16}/></button>
          </form>
          <div className="continuum-auth-safe"><ShieldCheck size={14}/> Secure staff sign-in powered by Supabase</div>
        </div>
      </div>
    )
  }

  const isGuest = guestMode && !session
  return (
    <>
      <div className={`continuum-session-bar ${isGuest ? 'guest-session-bar' : ''}`}>
        <span>{isGuest ? <><b>GUEST DEMO</b> · Fictional sample workspace · Changes stay in this session</> : <>Signed in as <b>{session.user.email}</b></>}</span>
        <button onClick={signOut}><LogOut size={14}/> {isGuest ? 'Exit demo' : 'Sign out'}</button>
      </div>
      {React.cloneElement(children, { session: isGuest ? null : session, onSignOut: signOut, demoMode: isGuest })}
    </>
  )
}
