import React,{useCallback,useEffect,useMemo,useState} from 'react'
import {PhoneCall,CalendarClock,ShieldCheck,RefreshCw,Phone,CheckCircle2,AlertCircle} from 'lucide-react'
import './voice-outreach.css'

const api=async(session,method='GET',body=null)=>{
 const r=await fetch('/api/voice',{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'})
 const d=await r.json();if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d
}
const fmt=v=>v?new Date(v).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'—'
const purposes={appointment_confirmation:'Appointment confirmation',documents_pending:'Pending documents',reschedule_request:'Reschedule request',postpartum_followup:'Postpartum and newborn follow-up',callback_request:'Callback request'}
const tone=s=>s==='completed'?'good':['scheduled','dispatching','queued','retrying'].includes(s)?'wait':['failed','busy','no_answer','blocked','dispatch_failed'].includes(s)?'bad':'muted'

export default function VoiceOutreach({session}){
 const [data,setData]=useState({patients:[],preferences:[],calls:[]})
 const [form,setForm]=useState({patient_id:'',phone_e164:'',language_code:'mr-IN',consent_status:'not_recorded',consent_confirmed:false,contact_is_parent_guardian:false,safe_start_time:'09:00',safe_end_time:'18:00'})
 const [schedule,setSchedule]=useState({purpose:'appointment_confirmation',scheduled_at:'',appointment_datetime:'',callback_instruction:'',clinic_callback_sla:'within one working day for administrative callbacks; the same working day for clinical callbacks'})
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const refresh=useCallback(async()=>{try{setData(await api(session))}catch(e){setError(e.message)}},[session?.access_token])
 useEffect(()=>{refresh()},[refresh])
 const prefMap=useMemo(()=>new Map(data.preferences.map(p=>[p.patient_id,p])),[data.preferences])
 const patient=data.patients.find(p=>p.id===form.patient_id)
 const patientDob=patient?.date_of_birth?new Date(patient.date_of_birth):null
 const currentDate=new Date()
 const isMinor=patientDob&&!Number.isNaN(patientDob.getTime())&&(currentDate.getFullYear()-patientDob.getFullYear()-(currentDate.getMonth()<patientDob.getMonth()||(currentDate.getMonth()===patientDob.getMonth()&&currentDate.getDate()<patientDob.getDate())?1:0))<18
 function choose(id){
  const p=prefMap.get(id),person=data.patients.find(x=>x.id===id)
  setForm(f=>({...f,patient_id:id,phone_e164:p?.phone_e164||(person?.phone?.startsWith('+')?person.phone:''),language_code:p?.language_code||'mr-IN',consent_status:p?.consent_status||'not_recorded',consent_confirmed:false,contact_is_parent_guardian:p?.contact_is_parent_guardian===true,safe_start_time:p?.safe_start_time||'09:00',safe_end_time:p?.safe_end_time||'18:00'}))
 }
 async function savePreference(e){
  e.preventDefault();setBusy(true);setError('');setNotice('')
  try{await api(session,'POST',{action:'preference',...form});setNotice('Calling preferences saved.');await refresh()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function scheduleCall(e){
  e.preventDefault();setBusy(true);setError('');setNotice('')
  try{const appointmentIso=schedule.appointment_datetime?new Date(schedule.appointment_datetime).toISOString():''
  const r=await api(session,'POST',{action:'schedule',patient_id:form.patient_id,...schedule,appointment_datetime:appointmentIso,scheduled_at:new Date(schedule.scheduled_at).toISOString()});setNotice(`Call scheduled for ${fmt(r.call.scheduled_at)}.`);setSchedule(s=>({...s,scheduled_at:''}));await refresh()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function cancel(id){
  setBusy(true);setError('');setNotice('')
  try{await api(session,'PATCH',{action:'cancel',id});setNotice('Call cancelled.');await refresh()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="vo-wrap">
  <header className="vo-head"><div><div className="vo-eyebrow">CONTINUUM VOICE</div><h2>Conversations that keep care connected.</h2><p>Consent-based multilingual calls linked to the person's journey, from fertility coordination through postpartum and newborn follow-up.</p></div><button className="vo-refresh" onClick={refresh}><RefreshCw size={14}/> Refresh</button></header>
  {error&&<div className="vo-alert"><AlertCircle size={15}/>{error}</div>}{notice&&<div className="vo-notice"><CheckCircle2 size={15}/>{notice}</div>}
  <div className="vo-stats"><div><b>{data.calls.filter(c=>['scheduled','dispatching','queued','retrying'].includes(c.status)).length}</b><span>Scheduled / queued</span></div><div><b>{data.calls.filter(c=>c.status==='completed').length}</b><span>Completed</span></div><div><b>{data.calls.filter(c=>['failed','busy','no_answer','dispatch_failed'].includes(c.status)).length}</b><span>Unsuccessful</span></div></div>
  {data.dispatch && !data.dispatch.ready && <div className="vo-alert"><AlertCircle size={15}/><span><b>Outbound calls are not live yet.</b> {data.dispatch.enabled ? 'Voice dispatch is enabled, but configuration is incomplete.' : 'Dispatch is switched off.'} Missing settings: {data.dispatch.missing_settings.join(', ') || 'none'}.</span></div>}
  {data.dispatch?.ready && <div className="vo-notice"><CheckCircle2 size={15}/><span><b>Voice dispatch configuration is present.</b> Confirm the Sarvam agent, Exotel Exophone, webhook and Supabase Cron schedule before any live call.</span></div>}
  <div className="vo-grid">
   <form className="vo-card" onSubmit={savePreference}><h3><ShieldCheck size={17}/> Patient calling preferences</h3>
    <label>Patient<select required value={form.patient_id} onChange={e=>choose(e.target.value)}><option value="">Choose patient</option>{data.patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
    <label>Phone number (E.164)<input required value={form.phone_e164} onChange={e=>setForm({...form,phone_e164:e.target.value})} placeholder="+919876543210"/></label>
    <label>Preferred language<select value={form.language_code} onChange={e=>setForm({...form,language_code:e.target.value})}>{[['mr-IN','Marathi'],['hi-IN','Hindi'],['en-IN','English']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <div className="vo-time"><label>Calls from<input type="time" value={form.safe_start_time} onChange={e=>setForm({...form,safe_start_time:e.target.value})}/></label><label>Calls until<input type="time" value={form.safe_end_time} onChange={e=>setForm({...form,safe_end_time:e.target.value})}/></label></div>
    <label>Consent<select value={form.consent_status} onChange={e=>setForm({...form,consent_status:e.target.value,consent_confirmed:false})}><option value="not_recorded">No consent recorded</option><option value="granted">Patient has explicitly consented</option><option value="revoked">Consent revoked / do not call</option></select></label>
    {form.consent_status==='granted'&&<label className="vo-check"><input type="checkbox" checked={form.consent_confirmed} onChange={e=>setForm({...form,consent_confirmed:e.target.checked})}/> I confirm the patient explicitly agreed to automated calls and understands they can opt out.</label>}
    {isMinor&&<label className="vo-check"><input type="checkbox" checked={form.contact_is_parent_guardian} onChange={e=>setForm({...form,contact_is_parent_guardian:e.target.checked})}/> I confirm this phone number belongs to the patient's parent or legal guardian.</label>}
    {patient&&!patientDob&&<small className="vo-failure">Date of birth is missing. The agent cannot be scheduled until the clinic record establishes adult/minor status.</small>}
    <button className="vo-primary" disabled={busy||!form.patient_id}><ShieldCheck size={15}/> Save preferences</button>
    {patient&&<small className="vo-help">Saved consent: {prefMap.get(patient.id)?.consent_status||'Not recorded'}</small>}
   </form>
   <form className="vo-card" onSubmit={scheduleCall}><h3><CalendarClock size={17}/> Schedule a conversational call</h3>
    <label>Patient<select required value={form.patient_id} onChange={e=>choose(e.target.value)}><option value="">Choose patient</option>{data.patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
    <label>Call purpose<select value={schedule.purpose} onChange={e=>setSchedule({...schedule,purpose:e.target.value})}>{Object.entries(purposes).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>Call date & time<input required type="datetime-local" value={schedule.scheduled_at} onChange={e=>setSchedule({...schedule,scheduled_at:e.target.value})}/></label>
    <label>Appointment date/time<input type="datetime-local" required={['appointment_confirmation','reschedule_request','postpartum_followup'].includes(schedule.purpose)} value={schedule.appointment_datetime} onChange={e=>setSchedule({...schedule,appointment_datetime:e.target.value})}/></label>
    {schedule.purpose==='documents_pending'&&<label>Clinic-approved document instructions<input required maxLength={200} value={schedule.callback_instruction} onChange={e=>setSchedule({...schedule,callback_instruction:e.target.value})} placeholder="Only categories confirmed by clinic staff"/></label>}
    <label>Clinic-approved callback SLA<input required maxLength={120} value={schedule.clinic_callback_sla} onChange={e=>setSchedule({...schedule,clinic_callback_sla:e.target.value})} placeholder="e.g. admin: within one working day; clinical: same working day"/></label>
    <button className="vo-primary" disabled={busy||!form.patient_id||!schedule.scheduled_at}><PhoneCall size={15}/> Schedule call</button>
    <p className="vo-help">The API checks saved consent. Vercel dispatches due calls to the active Sarvam campaign during its permitted calling window.</p>
   </form>
  </div>
  <div className="vo-card vo-history"><div className="vo-history-title"><h3><Phone size={17}/> Voice activity</h3><span>{data.calls.length} records</span></div>
   {!data.calls.length&&<p className="vo-help">No calls scheduled yet.</p>}
   {data.calls.map(c=><div className="vo-row" key={c.id}><div className="vo-call-icon"><PhoneCall size={15}/></div><div className="vo-main"><b>{data.patients.find(p=>p.id===c.patient_id)?.full_name||'Patient'}</b><small>{purposes[c.purpose]||c.purpose} · {fmt(c.scheduled_at)}</small>{c.failure_reason&&<small className="vo-failure">{c.failure_reason}</small>}</div><span className={`vo-status ${tone(c.status)}`}>{c.status.replaceAll('_',' ')}</span>{c.status==='scheduled'&&<button className="vo-cancel" disabled={busy} onClick={()=>cancel(c.id)}>Cancel</button>}</div>)}
  </div>
  <div className="vo-safety"><ShieldCheck size={17}/><span><b>Human-governed calling.</b> The voice agent handles administrative logistics only. It must not diagnose, interpret symptoms, recommend treatment or assess clinical urgency. Clinical questions and callback requests go to clinic staff.</span></div>
 </section>
}
