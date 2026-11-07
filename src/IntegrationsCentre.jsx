import React, { useCallback, useEffect, useState } from 'react'
import {
  BellRing, Smartphone, Activity, ShieldCheck, RefreshCw, CheckCircle2,
  AlertCircle, ExternalLink, HeartPulse, FileText, LockKeyhole
} from 'lucide-react'
import './integrations.css'

const headers = session => ({
  Authorization: 'Bearer ' + session.access_token,
  'Content-Type': 'application/json'
})

export default function IntegrationsCentre({ session }) {
  const [push, setPush] = useState({ configured: false, subscriptions: 0, devices: [] })
  const [abdm, setAbdm] = useState({ configured: false, environment: 'not_configured' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const auth = { Authorization: 'Bearer ' + session.access_token }
      const [pushRes, abdmRes] = await Promise.all([
        fetch('/api/push', { headers: auth, cache: 'no-store' }),
        fetch('/api/abdm', { headers: auth, cache: 'no-store' })
      ])
      const [pushData, abdmData] = await Promise.all([pushRes.json(), abdmRes.json()])
      if (!pushRes.ok) throw new Error(pushData.error || 'Could not load notification settings.')
      if (!abdmRes.ok) throw new Error(abdmData.error || 'Could not load ABDM status.')
      setPush(pushData)
      setAbdm(abdmData)
    } catch (e) {
      setError(e.message || 'Could not load integrations.')
    }
  }, [session?.access_token])

  useEffect(() => { refresh() }, [refresh])

  function base64UrlToUint8Array(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4)
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
  }

  async function enablePush() {
    setBusy(true); setError(''); setNotice('')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('This browser does not support web push. On iPhone, add Continuum to the Home Screen and open it from there.')
      }
      const configRes = await fetch('/api/push', { headers: { Authorization: 'Bearer ' + session.access_token } })
      const config = await configRes.json()
      if (!configRes.ok) throw new Error(config.error || 'Push configuration is unavailable.')
      if (!config.configured || !config.publicKey) {
        throw new Error('Push is not configured on the server yet. Add the VAPID keys in Vercel.')
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const registration = await navigator.serviceWorker.register('/service-worker.js')
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(config.publicKey)
        })
      }
      const response = await fetch('/api/push', {
        method: 'POST',
        headers: headers(session),
        body: JSON.stringify({
          action: 'subscribe',
          subscription: subscription.toJSON(),
          device_label: navigator.userAgent.slice(0, 120)
        })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save this device.')
      setNotice('This device is registered for generic Continuum notifications.')
      await refresh()
    } catch (e) {
      setError(e.message || 'Could not enable notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/push', {
        method: 'POST',
        headers: headers(session),
        body: JSON.stringify({ action: 'test' })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Test notification failed.')
      setNotice('Test notification sent. Check this device.')
    } catch (e) {
      setError(e.message || 'Could not send a test notification.')
    } finally {
      setBusy(false)
    }
  }

  async function disablePush() {
    setBusy(true); setError(''); setNotice('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/service-worker.js')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const response = await fetch('/api/push', {
          method: 'DELETE',
          headers: headers(session),
          body: JSON.stringify({ endpoint: subscription.endpoint })
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not remove the saved device.')
        await subscription.unsubscribe()
      }
      setNotice('This device has been disconnected from Continuum push notifications.')
      await refresh()
    } catch (e) {
      setError(e.message || 'Could not disable notifications.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ic-wrap">
      <header className="ic-head">
        <div>
          <div className="eyebrow">CONTINUUM · CONNECTED SERVICES</div>
          <h2>Integrations & notifications</h2>
          <p>Bring generic reminders to the right device and prepare secure connections to India’s digital health ecosystem.</p>
        </div>
        <button className="ic-secondary" onClick={refresh} disabled={busy}><RefreshCw size={14}/> Refresh</button>
      </header>

      {error && <div className="ic-alert"><AlertCircle size={15}/>{error}</div>}
      {notice && <div className="ic-notice"><CheckCircle2 size={15}/>{notice}</div>}

      <div className="ic-grid">
        <article className="ic-card">
          <div className="ic-card-title"><span className="ic-icon"><BellRing size={18}/></span><div><h3>Phone & wearable notifications</h3><small>{push.configured ? push.subscriptions + ' device(s) registered' : 'Server setup required'}</small></div></div>
          <p>Receive non-sensitive reminders and workflow updates as push notifications. On iPhone, install Continuum as a Home Screen web app before enabling notifications.</p>
          <div className="ic-device-row"><Smartphone size={17}/><span>iPhone / Android phone</span><span className="ic-state">{push.configured ? 'Web push' : 'Not configured'}</span></div>
          <div className="ic-device-row"><Activity size={17}/><span>Apple Watch</span><span className="ic-state">Via iPhone notification forwarding</span></div>
          <div className="ic-actions">
            <button className="ic-primary" onClick={enablePush} disabled={busy}><BellRing size={14}/> Enable on this device</button>
            <button className="ic-secondary" onClick={sendTest} disabled={busy || !(push.subscriptions > 0)}>Send test</button>
            <button className="ic-text-button" onClick={disablePush} disabled={busy || !(push.subscriptions > 0)}>Disconnect this device</button>
          </div>
          <div className="ic-note"><ShieldCheck size={14}/> Push payloads must contain generic reminders only — never diagnoses, reports, pregnancy details or other sensitive health information.</div>
        </article>

        <article className="ic-card">
          <div className="ic-card-title"><span className="ic-icon"><HeartPulse size={18}/></span><div><h3>Apple Health / HealthKit</h3><small>Native iOS companion required for health-data access</small></div></div>
          <p>HealthKit is the Apple framework for reading or sharing Health app and Apple Watch data with a user’s permission. Continuum’s current React web app cannot directly access HealthKit.</p>
          <div className="ic-status-line"><LockKeyhole size={15}/><b>Not connected</b><span>No health measurements are read or stored.</span></div>
          <div className="ic-note">For this reminder MVP, HealthKit is not required. Web push can notify the iPhone; iOS may forward the alert to a paired Apple Watch according to notification settings.</div>
          <a className="ic-link" href="https://developer.apple.com/documentation/healthkit" target="_blank" rel="noreferrer">Apple HealthKit developer documentation <ExternalLink size={13}/></a>
        </article>

        <article className="ic-card">
          <div className="ic-card-title"><span className="ic-icon"><ShieldCheck size={18}/></span><div><h3>ABHA / ABDM health records</h3><small>{abdm.configured ? 'Sandbox credentials detected' : 'Sandbox onboarding required'}</small></div></div>
          <p>Continuum is prepared for a consent-based ABDM Health Information User (HIU) integration. An ABHA number alone does not grant access to a person’s health records.</p>
          <div className="ic-status-line"><span className={'ic-dot ' + (abdm.configured ? 'ready' : '')}/><b>{abdm.configured ? 'Credentials present — exchange workflow not activated' : 'Not connected to ABDM'}</b></div>
          <ul className="ic-list">
            <li>Patient-initiated consent for each permitted data purpose.</li>
            <li>Health records requested from the originating provider through ABDM exchange.</li>
            <li>Imported files saved in the private Document Inbox with source and consent references.</li>
          </ul>
          <a className="ic-link" href="https://sandbox.abdm.gov.in/" target="_blank" rel="noreferrer">ABDM developer sandbox <ExternalLink size={13}/></a>
          <a className="ic-link" href="https://abdm.gov.in/" target="_blank" rel="noreferrer">Ayushman Bharat Digital Mission <ExternalLink size={13}/></a>
        </article>

        <article className="ic-card">
          <div className="ic-card-title"><span className="ic-icon"><FileText size={18}/></span><div><h3>Government registries & records</h3><small>Reference links and document intake</small></div></div>
          <p>Existing government platforms may be used where available. Their records are not automatically accessible to Continuum; imports need an approved integration or patient-authorised document export.</p>
          <a className="ic-link" href="https://hfr.abdm.gov.in/" target="_blank" rel="noreferrer">Health Facility Registry (HFR) <ExternalLink size={13}/></a>
          <a className="ic-link" href="https://hpr.abdm.gov.in/" target="_blank" rel="noreferrer">Healthcare Professionals Registry (HPR) <ExternalLink size={13}/></a>
          <a className="ic-link" href="https://uwin.mohfw.gov.in/home" target="_blank" rel="noreferrer">U-WIN immunisation platform <ExternalLink size={13}/></a>
          <div className="ic-note">For the demo, staff may upload patient-provided ABHA-linked records or U-WIN certificates into Document Inbox. Sarvam Document AI classifies and extracts administrative metadata for staff verification.</div>
        </article>
      </div>
      <p className="ic-footnote">Push currently registers the signed-in Continuum account, not a patient account. Patient-specific delivery requires a verified patient-portal identity link and separate notification consent. This tab does not connect to HealthKit or retrieve ABDM health records.</p>
    </section>
  )
}
