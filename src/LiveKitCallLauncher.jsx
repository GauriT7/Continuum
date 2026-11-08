import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, PhoneCall, ShieldCheck, Clock3, CheckCircle2, AlertCircle, Share2 } from 'lucide-react';
import './livekit-call.css';

const fmt = value => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Appointment';

export default function LiveKitCallLauncher({ session, appointments = [], patients = [] }) {
  const [appointmentId, setAppointmentId] = useState('');
  const [consent, setConsent] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [invite, setInvite] = useState(null);
  const [history, setHistory] = useState([]);

  async function loadHistory() {
    if (!session?.access_token) return;
    try {
      const response = await fetch('/api/voice-agent/livekit/invites', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setHistory(data.calls || []);
    } catch { /* history is supplementary; call creation remains available */ }
  }
  useEffect(() => { loadHistory(); }, [session?.access_token]);

  const selectedAppointment = appointments.find(item => item.id === appointmentId);
  const patient = patients.find(item => item.id === selectedAppointment?.patient_id);
  const patientAge = useMemo(() => {
    if (!patient?.date_of_birth) return null;
    const dob = new Date(patient.date_of_birth);
    if (Number.isNaN(dob.getTime())) return null;
    const now = new Date();
    return now.getFullYear() - dob.getFullYear() - ((now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) ? 1 : 0);
  }, [patient?.date_of_birth]);
  const isMinor = patientAge !== null && patientAge < 18;

  async function createInvitation(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice(''); setInvite(null);
    try {
      const response = await fetch('/api/voice-agent/livekit/invites', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: appointmentId,
          recipient_consent_confirmed: consent,
          guardian_confirmed: guardian,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create the invitation.');
      setInvite(data);
      setNotice('Secure voice invitation created. It expires in 30 minutes.');
      loadHistory();
    } catch (e) {
      setError(e.message || 'Could not create the invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!invite?.invitation_url) return;
    await navigator.clipboard.writeText(invite.invitation_url);
    setNotice('Invitation link copied. Share it with the consenting recipient.');
  }

  async function shareLink() {
    if (!invite?.invitation_url) return;
    const shareText = 'You are invited to a short appointment reminder call with ' + invite.clinic_name + '. Open this secure Continuum link: ' + invite.invitation_url;
    if (navigator.share) {
      try { await navigator.share({ title: 'Continuum voice invitation', text: shareText, url: invite.invitation_url }); }
      catch (e) { if (e?.name !== 'AbortError') setError('Could not open the share sheet. Copy the invitation link instead.'); }
    } else {
      await copyLink();
    }
  }

  return (
    <section className="lk-launcher">
      <header className="lk-launcher-head">
        <div className="lk-launcher-icon"><PhoneCall size={20}/></div>
        <div><span>LIVEKIT · BROWSER VOICE</span><h2>AI appointment call</h2><p>Create a secure link for the recipient to join a live voice session with Continuum.</p></div>
        <b className="lk-live-pill">WEB VOICE</b>
      </header>
      {error && <div className="lk-alert"><AlertCircle size={15}/>{error}</div>}
      {notice && <div className="lk-notice"><CheckCircle2 size={15}/>{notice}</div>}
      <form className="lk-launcher-grid" onSubmit={createInvitation}>
        <div className="lk-launcher-card">
          <h3>1 · Select appointment</h3>
          <label>Scheduled appointment
            <select required value={appointmentId} onChange={e => { setAppointmentId(e.target.value); setInvite(null); setConsent(false); setGuardian(false); }}>
              <option value="">Choose an appointment</option>
              {appointments.filter(item => !item.status || item.status === 'scheduled').map(item => {
                const person = patients.find(p => p.id === item.patient_id);
                return <option key={item.id} value={item.id}>{(person?.full_name || 'Patient') + ' · ' + fmt(item.scheduled_at)}</option>;
              })}
            </select>
          </label>
          {selectedAppointment && <div className="lk-appointment-preview"><b>{patient?.full_name || 'Patient'}</b><span>{selectedAppointment.appointment_type || 'Appointment'}</span><small>{fmt(selectedAppointment.scheduled_at)}</small></div>}
        </div>
        <div className="lk-launcher-card">
          <h3>2 · Confirm permission</h3>
          <label className="lk-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/> I confirm the recipient has agreed to receive and join this AI voice invitation.</label>
          {isMinor && <label className="lk-check"><input type="checkbox" checked={guardian} onChange={e => setGuardian(e.target.checked)}/> I confirm a parent or legal guardian has agreed to this invitation.</label>}
          <div className="lk-message"><span>MESSAGE TO BE SPOKEN</span><p>{selectedAppointment ? 'Your appointment reminder will be generated from the saved appointment date and time.' : 'Choose an appointment to preview its reminder.'}</p></div>
          <button className="lk-primary" type="submit" disabled={busy || !appointmentId || !consent || (isMinor && !guardian)}><PhoneCall size={15}/>{busy ? 'Creating secure invitation…' : 'Create voice invitation'}</button>
        </div>
      </form>
      {invite && <section className="lk-invite-result">
        <div className="lk-invite-title"><div><span>INVITATION CREATED</span><h3>{invite.patient_name}</h3><small>{invite.clinic_name} · {invite.appointment_datetime}</small></div><span className="lk-expiry"><Clock3 size={13}/> Expires in 30 min</span></div>
        <blockquote>{invite.message}</blockquote>
        <label>Patient invitation link<input readOnly value={invite.invitation_url}/></label>
        <div className="lk-invite-actions">
          <button className="lk-primary" type="button" onClick={copyLink}><Copy size={14}/> Copy secure link</button>
          <button className="lk-secondary" type="button" onClick={shareLink}><Share2 size={14}/> Share invitation</button>
          <a href={invite.invitation_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open join page</a>
        </div>
        <p className="lk-footnote"><ShieldCheck size={13}/> The link expires automatically. The recipient must open it and tap Join call; it does not dial their mobile number.</p>
      </section>}
      <section className="lk-history">
        <div className="lk-history-head"><h3>Recent browser voice sessions</h3><button type="button" onClick={loadHistory}>Refresh</button></div>
        {history.length === 0 ? <p>No LiveKit invitations yet.</p> : history.slice(0,8).map(call => <div className="lk-history-row" key={call.id}><div><b>{call.patient_name}</b><small>{call.appointment_datetime} · {new Date(call.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></div><span className={'lk-history-status ' + call.status}>{call.status.replaceAll('_',' ')}{call.duration_seconds ? ' · ' + Math.floor(call.duration_seconds / 60) + 'm ' + (call.duration_seconds % 60) + 's' : ''}</span></div>)}
        <p className="lk-footnote">History records invitation and session completion. This first version does not generate a transcript or determine whether an appointment was confirmed.</p>
      </section>
    </section>
  );
}
