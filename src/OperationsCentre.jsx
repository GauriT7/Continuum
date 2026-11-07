import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import {
  Users, ListChecks, CalendarDays, FileText, Sparkles, Plus, RefreshCw,
  Check, Circle, Mic, Languages, Volume2, UploadCloud, Search, Clock3,
  AlertCircle, Loader2, ArrowRight, X, UserRound, HeartHandshake
} from 'lucide-react'
import './operations.css'

const tabs = [
  ['patients','People',Users], ['journeys','Journeys',HeartHandshake],
  ['tasks','Tasks',ListChecks], ['appointments','Appointments',CalendarDays],
  ['documents','Documents',FileText], ['ai','Sarvam AI',Sparkles]
]
const callApi = async (session, method='GET', body=null) => {
  const response = await fetch('/api/continuum', {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? {'Content-Type':'application/json'} : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store'
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}
const callSarvam = async (session, body) => {
  const response = await fetch('/api/sarvam', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
    body: JSON.stringify(body)
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Sarvam request failed (${response.status})`)
  return data
}
const fmt = value => value ? new Date(value).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}) : 'No date set'

export default function OperationsCentre({ session }) {
  const [tab,setTab] = useState('patients')
  const [data,setData] = useState({clinics:[],patients:[],journeys:[],tasks:[],appointments:[],documents:[]})
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [search,setSearch] = useState('')
  const [patientForm,setPatientForm] = useState({full_name:'',phone:'',date_of_birth:'',partner_name:''})
  const [journeyForm,setJourneyForm] = useState({patient_id:'',journey_type:'fertility'})
  const [taskForm,setTaskForm] = useState({patient_id:'',journey_id:'',title:'',description:'',assigned_role:'admin',due_at:''})
  const [appointmentForm,setAppointmentForm] = useState({patient_id:'',scheduled_at:'',appointment_type:'Follow-up'})
  const [docPatient,setDocPatient] = useState('')
  const [docFile,setDocFile] = useState(null)
  const [docType,setDocType] = useState('Other')
  const [docJob,setDocJob] = useState(null)
  const [docReview,setDocReview] = useState(null)
  const [aiPrompt,setAiPrompt] = useState('')
  const [aiReply,setAiReply] = useState('')
  const [translation,setTranslation] = useState('')
  const [translated,setTranslated] = useState('')
  const [targetLanguage,setTargetLanguage] = useState('mr-IN')
  const [voiceText,setVoiceText] = useState('')
  const [audioUrl,setAudioUrl] = useState('')
  const [voiceFile,setVoiceFile] = useState(null)
  const [transcript,setTranscript] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { const next = await callApi(session); setData(next) }
    catch(e) { setError(e.message) }
    finally { setLoading(false) }
  },[session?.access_token])
  useEffect(()=>{ refresh() },[refresh])

  const patients = data.patients || []
  const patientName = id => patients.find(p=>p.id===id)?.full_name || 'Patient'
  const filteredPatients = useMemo(()=>patients.filter(p=>`${p.full_name} ${p.phone||''}`.toLowerCase().includes(search.toLowerCase())),[patients,search])
  const mutate = async (action, body) => {
    setBusy(true); setError(''); setNotice('')
    try { await callApi(session,'POST',{action,...body}); setNotice('Saved to Continuum.'); await refresh() }
    catch(e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const patch = async (action, body) => {
    setBusy(true); setError(''); setNotice('')
    try { await callApi(session,'PATCH',{action,...body}); setNotice('Update saved.'); await refresh() }
    catch(e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function createPatient(e) {
    e.preventDefault()
    await mutate('patient',patientForm)
    setPatientForm({full_name:'',phone:'',date_of_birth:'',partner_name:''})
  }
  async function createJourney(e) {
    e.preventDefault(); await mutate('journey',journeyForm)
    setJourneyForm({patient_id:'',journey_type:'fertility'})
  }
  async function createTask(e) {
    e.preventDefault(); await mutate('task',{...taskForm,due_at:taskForm.due_at ? new Date(taskForm.due_at).toISOString() : null})
    setTaskForm({patient_id:'',journey_id:'',title:'',description:'',assigned_role:'admin',due_at:''})
  }
  async function createAppointment(e) {
    e.preventDefault(); await mutate('appointment',{...appointmentForm,scheduled_at:new Date(appointmentForm.scheduled_at).toISOString()})
    setAppointmentForm({patient_id:'',scheduled_at:'',appointment_type:'Follow-up'})
  }

  async function uploadDocument(e) {
    e.preventDefault()
    if (!docFile || !docPatient) return setError('Choose a patient and a document.')
    if (docFile.size > 15*1024*1024) return setError('For this prototype, documents must be under 15 MB.')
    setBusy(true); setError(''); setNotice('')
    try {
      const clinicId = data.clinics?.[0]?.id
      const safeName = docFile.name.replace(/[^a-zA-Z0-9._-]/g,'_')
      const path = `${clinicId}/${docPatient}/${Date.now()}-${safeName}`
      const {error:uploadError} = await supabase.storage.from('continuum-documents').upload(path,docFile,{upsert:false,contentType:docFile.type})
      if (uploadError) throw uploadError
      await callApi(session,'POST',{action:'document',patient_id:docPatient,file_name:docFile.name,storage_path:path,mime_type:docFile.type,document_type:docType})
      setDocFile(null); setNotice('Document uploaded and added to the review inbox.'); await refresh()
    } catch(e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function runDocAI(doc,operation) {
    setBusy(true); setError(''); setDocJob(null)
    try {
      const result = await callSarvam(session,{action:'doc-submit',storage_path:doc.storage_path,file_name:doc.file_name,mime_type:doc.mime_type || 'application/pdf',operation,language:'en-IN'})
      setDocJob({job_id:result.job_id,status:result.status,operation,document:doc})
      setNotice(`Sarvam ${operation} job submitted for human review.`)
    } catch(e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function pollDocJob() {
  if (!docJob?.job_id) return

  setBusy(true)
  setError('')
  setNotice('')

  try {
    const status = await callSarvam(session, {
      action: 'doc-status',
      job_id: docJob.job_id
    })

    const state =
      status.result?.status ||
      status.result?.job_status ||
      'updated'

    setDocJob(j => ({
      ...j,
      status: state,
      statusPayload: status.result
    }))

    if (['completed', 'partially_completed'].includes(state)) {
      const response = await callSarvam(session, {
        action: 'doc-results',
        job_id: docJob.job_id
      })

      // Sarvam's response has the extracted fields under result,
      // and confidence/page evidence under annotations.
      const extraction = response.result || {}
      const extracted = extraction.result || {}
      const annotations = extraction.annotations || {}

      setDocJob(j => ({
        ...j,
        status: state,
        results: extraction
      }))

      setDocReview({
        document: docJob.document,
        job_id: docJob.job_id,
        values: {
          patient_name: extracted.patient_name || '',
          document_date: extracted.document_date || '',
          issuing_facility: extracted.issuing_facility || '',
          document_type: extracted.document_type || ''
        },
        annotations,
        original: extraction
      })

      setNotice('Extraction complete. Review and confirm the fields below.')
    } else if (['failed', 'cancelled'].includes(state)) {
      setError(`Document AI job ${state}.`)
    } else {
      setNotice(`Document AI job status: ${state}. Check again shortly.`)
    }
  } catch (e) {
    setError(e.message)
  } finally {
    setBusy(false)
  }
}

  async function approveDocumentExtraction() {
  if (!docReview?.document?.id) return

  setBusy(true)
  setError('')
  setNotice('')

  try {
    const response = await callApi(session, 'PATCH', {
      action: 'document',
      id: docReview.document.id,
      confirm_extraction: true,
      verified_metadata: docReview.values,
      extraction_result: docReview.original.result || {},
      extraction_annotations: docReview.annotations
    })

    setNotice('Verified metadata saved. Document marked as reviewed.')

    setDocReview(null)
    setDocJob(null)

    await refresh()
  } catch (e) {
    setError(e.message)
  } finally {
    setBusy(false)
  }
}
  
  async function translateText(e) {
    e.preventDefault(); setBusy(true); setError('')
    try { const r=await callSarvam(session,{action:'translate',input:translation,target_language_code:targetLanguage,source_language_code:'auto'}); setTranslated(r.translated_text||'') }
    catch(e){setError(e.message)} finally{setBusy(false)}
  }
  async function speakText() {
    setBusy(true); setError('')
    try {
      const r=await callSarvam(session,{action:'tts',text:voiceText,language_code:'mr-IN'})
      const binary=atob(r.audio_base64); const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))
      if(audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioUrl(URL.createObjectURL(new Blob([bytes],{type:r.mime_type||'audio/mpeg'})))
    } catch(e){setError(e.message)} finally{setBusy(false)}
  }
  async function transcribeVoice() {
    if(!voiceFile) return setError('Choose a voice note first.')
    setBusy(true); setError('')
    try {
      const base64 = await new Promise((resolve,reject)=>{
        const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result).split(',')[1]); reader.onerror=reject; reader.readAsDataURL(voiceFile)
      })
      const r=await callSarvam(session,{action:'stt',audio_base64:base64,mime_type:voiceFile.type||'audio/mp4',file_name:voiceFile.name,mode:'codemix'})
      setTranscript(r.transcript||'')
    } catch(e){setError(e.message)} finally{setBusy(false)}
  }
  async function askAssistant(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {const r=await callSarvam(session,{action:'assistant',prompt:aiPrompt});setAiReply(r.reply||'')}
    catch(e){setError(e.message)} finally{setBusy(false)}
  }

  const extractionEvidence = (key) => {
  const annotation = docReview?.annotations?.[key]

  const confidence = annotation?.confidence
  const sources = annotation?.sources || []

  return {
    confidence:
      typeof confidence === 'number'
        ? `${Math.round(confidence * 100)}%`
        : 'Not provided',
    pages: [...new Set(sources.map(s => s.page_num).filter(Boolean))],
    sources
  }
}

  const field = (label,child) => <label className="oc-field"><span>{label}</span>{child}</label>
  const button = (label,icon=null,disabled=false) => <button className="oc-primary" disabled={disabled||busy}>{icon}{label}</button>

  return <section className="oc-wrap">
    <div className="oc-heading"><div><div className="eyebrow">CONTINUUM OPERATIONS</div><h2>One place to keep every care loop moving.</h2><p>Shared records and administrative workflows across the clinic.</p></div><button className="oc-secondary" onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh data</button></div>
    <div className="oc-tabs">{tabs.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={15}/>{label}</button>)}</div>
    {error&&<div className="oc-alert"><AlertCircle size={16}/>{error}</div>}
    {notice&&<div className="oc-notice"><Check size={15}/>{notice}</div>}
    {loading?<div className="oc-loading"><Loader2 className="oc-spin"/> Loading your clinic workspace…</div>:<>
      {tab==='patients'&&<div className="oc-grid">
        <form className="oc-card" onSubmit={createPatient}><h3><Plus size={17}/> Register a person</h3>
          {field('Full name',<input required value={patientForm.full_name} onChange={e=>setPatientForm({...patientForm,full_name:e.target.value})} placeholder="Patient full name"/>)}
          {field('Phone (optional)',<input value={patientForm.phone} onChange={e=>setPatientForm({...patientForm,phone:e.target.value})} placeholder="+91…"/>)}
          {field('Date of birth (optional)',<input type="date" value={patientForm.date_of_birth} onChange={e=>setPatientForm({...patientForm,date_of_birth:e.target.value})}/>)}
          {field('Partner name (optional)',<input value={patientForm.partner_name} onChange={e=>setPatientForm({...patientForm,partner_name:e.target.value})} placeholder="Partner full name"/>)}
          {button('Create patient',<Plus size={15}/>)}
        </form>
        <div className="oc-card"><div className="oc-card-head"><h3><Users size={17}/> People in this clinic</h3><span>{patients.length} records</span></div>
          <div className="oc-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or phone"/></div>
          <div className="oc-list">{filteredPatients.map(p=><div className="oc-row" key={p.id}><div className="oc-avatar">{p.full_name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div><div className="oc-row-main"><b>{p.full_name}</b><small>{p.phone||'No phone added'} · Added {fmt(p.created_at)}</small></div></div>)}{!filteredPatients.length&&<p className="oc-muted">No matching patient records.</p>}</div>
        </div>
      </div>}
      {tab==='journeys'&&<div className="oc-grid">
        <form className="oc-card" onSubmit={createJourney}><h3><HeartHandshake size={17}/> Start a journey</h3>
          {field('Patient',<select required value={journeyForm.patient_id} onChange={e=>setJourneyForm({...journeyForm,patient_id:e.target.value})}><option value="">Choose patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select>)}
          {field('Journey type',<select value={journeyForm.journey_type} onChange={e=>setJourneyForm({...journeyForm,journey_type:e.target.value})}><option value="fertility">Fertility</option><option value="antenatal">Antenatal</option><option value="postpartum">Postpartum</option><option value="newborn">Newborn</option></select>)}
          {button('Create journey',<Plus size={15}/>)}
          <p className="oc-help">The clinic configures the actual administrative plan. Continuum does not generate clinical care plans.</p>
        </form>
        <div className="oc-card"><div className="oc-card-head"><h3>Active journeys</h3><span>{data.journeys.length}</span></div>{data.journeys.map(j=><div className="oc-row" key={j.id}><div className="oc-row-main"><b>{patientName(j.patient_id)}</b><small>{j.journey_type} · {j.status} · {fmt(j.created_at)}</small></div><span className="oc-pill">{j.journey_type}</span></div>)}</div>
      </div>}
      {tab==='tasks'&&<div className="oc-grid">
        <form className="oc-card" onSubmit={createTask}><h3><Plus size={17}/> Add a workflow task</h3>
          {field('Patient',<select required value={taskForm.patient_id} onChange={e=>setTaskForm({...taskForm,patient_id:e.target.value,journey_id:''})}><option value="">Choose patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select>)}
          {field('Linked journey',<select value={taskForm.journey_id} onChange={e=>setTaskForm({...taskForm,journey_id:e.target.value})}><option value="">No journey selected</option>{data.journeys.filter(j=>j.patient_id===taskForm.patient_id).map(j=><option key={j.id} value={j.id}>{j.journey_type}</option>)}</select>)}
          {field('Task title',<input required value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} placeholder="e.g. Collect requested document"/>)}
          {field('Details',<textarea rows="2" value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})} placeholder="Administrative instructions only"/>)}
          {field('Assign to role',<select value={taskForm.assigned_role} onChange={e=>setTaskForm({...taskForm,assigned_role:e.target.value})}><option value="admin">Clinic admin</option><option value="doctor">Doctor</option><option value="nurse">Nurse</option><option value="field_worker">Field worker</option><option value="patient">Patient</option><option value="partner">Partner</option></select>)}
          {field('Due date (optional)',<input type="datetime-local" value={taskForm.due_at} onChange={e=>setTaskForm({...taskForm,due_at:e.target.value})}/>)}
          {button('Create task',<Plus size={15}/>)}
        </form>
        <div className="oc-card"><div className="oc-card-head"><h3>Clinic task queue</h3><span>{data.tasks.filter(t=>t.status!=='completed').length} open</span></div>
          {data.tasks.map(t=><div className="oc-row" key={t.id}><button className={`oc-check ${t.status==='completed'?'done':''}`} disabled={busy} onClick={()=>patch('task',{id:t.id,status:t.status==='completed'?'pending':'completed'})}>{t.status==='completed'?<Check size={14}/>:<Circle size={16}/>}</button><div className="oc-row-main"><b className={t.status==='completed'?'oc-strike':''}>{t.title}</b><small>{patientName(t.patient_id)} · {t.assigned_role||'Unassigned'} · Due {fmt(t.due_at)}</small></div><span className={`oc-pill ${t.status}`}>{t.status.replace('_',' ')}</span></div>)}
        </div>
      </div>}
      {tab==='appointments'&&<div className="oc-grid">
        <form className="oc-card" onSubmit={createAppointment}><h3><CalendarDays size={17}/> Schedule an appointment</h3>
          {field('Patient',<select required value={appointmentForm.patient_id} onChange={e=>setAppointmentForm({...appointmentForm,patient_id:e.target.value})}><option value="">Choose patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select>)}
          {field('Date and time',<input required type="datetime-local" value={appointmentForm.scheduled_at} onChange={e=>setAppointmentForm({...appointmentForm,scheduled_at:e.target.value})}/>)}
          {field('Appointment label',<input value={appointmentForm.appointment_type} onChange={e=>setAppointmentForm({...appointmentForm,appointment_type:e.target.value})}/>)}
          {button('Save appointment',<Plus size={15}/>)}
        </form>
        <div className="oc-card"><div className="oc-card-head"><h3>Upcoming & recent appointments</h3><span>{data.appointments.length}</span></div>
          {data.appointments.map(a=><div className="oc-row" key={a.id}><div className="oc-row-main"><b>{patientName(a.patient_id)}</b><small>{a.appointment_type||'Appointment'} · {fmt(a.scheduled_at)}</small></div><select className="oc-inline-select" value={a.status} onChange={e=>patch('appointment',{id:a.id,status:e.target.value})}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="rescheduled">Rescheduled</option></select></div>)}
        </div>
      </div>}
      {tab==='documents'&&<div className="oc-grid">
        <form className="oc-card" onSubmit={uploadDocument}><h3><UploadCloud size={17}/> Secure document inbox</h3>
          {field('Link to patient',<select required value={docPatient} onChange={e=>setDocPatient(e.target.value)}><option value="">Choose patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select>)}
          {field('Document category',<select value={docType} onChange={e=>setDocType(e.target.value)}><option>Other</option><option>Lab report</option><option>Referral letter</option><option>Discharge summary</option><option>Identity document</option><option>Appointment document</option></select>)}
          {field('Choose file (PDF, JPG, PNG)',<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setDocFile(e.target.files?.[0]||null)}/>)}
          {button('Upload document',<UploadCloud size={15}/>)}
          <p className="oc-help">Files are stored in a private Supabase bucket. AI output is a draft for staff review, never a clinical interpretation.</p>
        </form>
        <div className="oc-card"><div className="oc-card-head"><h3>Received documents</h3><span>{data.documents.length}</span></div>
          {data.documents.map(d=><div className="oc-doc" key={d.id}><div className="oc-row-main"><b>{d.file_name}</b><small>{patientName(d.patient_id)} · {d.document_type||'Unclassified'} · {d.review_status}</small></div><div className="oc-doc-actions"><button className="oc-secondary" onClick={()=>runDocAI(d,'classify')} disabled={busy}>Classify</button><button className="oc-secondary" onClick={()=>runDocAI(d,'extract')} disabled={busy}>Extract fields</button><button className="oc-secondary" onClick={()=>patch('document',{id:d.id,review_status:'reviewed'})}>Mark reviewed</button></div></div>)}
          {docJob && (
  <div className="oc-job">
    <div className="oc-card-head">
      <h3>Document Intelligence</h3>
      <span className="oc-pill">{docJob.status}</span>
    </div>

    <p className="oc-help">
      Sarvam Document AI · {docJob.operation}
    </p>

    <small>Job ID: {docJob.job_id}</small>

    {!docReview && (
      <button
        type="button"
        className="oc-secondary"
        onClick={pollDocJob}
        disabled={busy}
      >
        <RefreshCw size={14}/>
        Check status / retrieve results
      </button>
    )}

    {docReview && (
      <div className="oc-review">
        <div className="oc-notice">
          <Check size={15}/>
          Extraction complete. Please verify every field.
        </div>

        <div className="oc-review-warning">
          AI-extracted information is a draft. Check it against
          the original document before confirming.
        </div>

        {[
          ['patient_name', 'Patient name'],
          ['document_date', 'Document date'],
          ['issuing_facility', 'Issuing facility'],
          ['document_type', 'Document type']
        ].map(([key, label]) => {
          const evidence = extractionEvidence(key)

          return (
            <div className="oc-review-field" key={key}>
              <label className="oc-field">
                <span>{label}</span>

                <input
                  value={docReview.values[key]}
                  onChange={e =>
                    setDocReview(current => ({
                      ...current,
                      values: {
                        ...current.values,
                        [key]: e.target.value
                      }
                    }))
                  }
                  placeholder={`Enter ${label.toLowerCase()}`}
                />
              </label>

              <div className="oc-evidence">
                <span>
                  AI confidence: <b>{evidence.confidence}</b>
                </span>

                <span>
                  Source page(s):{' '}
                  <b>
                    {evidence.pages.length
                      ? evidence.pages.join(', ')
                      : 'Not provided'}
                  </b>
                </span>
              </div>
            </div>
          )
        })}

        <div className="oc-review-actions">
          <button
            type="button"
            className="oc-primary"
            onClick={approveDocumentExtraction}
            disabled={
              busy ||
              !docReview.values.patient_name.trim() ||
              !docReview.values.document_type.trim()
            }
          >
            <Check size={15}/>
            Confirm and save metadata
          </button>

          <button
            type="button"
            className="oc-secondary"
            onClick={() => setDocReview(null)}
            disabled={busy}
          >
            Cancel review
          </button>
        </div>

        <details className="oc-technical">
          <summary>Technical details · raw Sarvam response</summary>
          <pre>
            {JSON.stringify(docReview.original, null, 2)}
          </pre>
        </details>
      </div>
    )}
  </div>
)}
        </div>
      </div>}
      {tab==='ai'&&<div className="oc-ai-grid">
        <form className="oc-card" onSubmit={askAssistant}><h3><Sparkles size={17}/> Workflow assistant · Sarvam-105B</h3><p className="oc-help">Draft administrative task suggestions and messages. Nothing is sent or saved automatically.</p>{field('What needs organising?',<textarea rows="4" value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Example: The patient has sent a report and the partner still needs to submit their document. Draft the admin follow-up tasks."/>)}
          {button('Generate suggestions',<Sparkles size={15}/>)}
          {aiReply&&<div className="oc-ai-result"><b>Suggestion for review</b><p>{aiReply}</p></div>}
        </form>
        <form className="oc-card" onSubmit={translateText}><h3><Languages size={17}/> Translate a message</h3>{field('Message',<textarea rows="3" value={translation} onChange={e=>setTranslation(e.target.value)} placeholder="Enter approved patient-facing text"/>)}
          {field('Target language',<select value={targetLanguage} onChange={e=>setTargetLanguage(e.target.value)}><option value="mr-IN">Marathi</option><option value="hi-IN">Hindi</option><option value="en-IN">English</option><option value="ta-IN">Tamil</option><option value="gu-IN">Gujarati</option><option value="bn-IN">Bengali</option><option value="te-IN">Telugu</option><option value="kn-IN">Kannada</option><option value="pa-IN">Punjabi</option><option value="ml-IN">Malayalam</option><option value="od-IN">Odia</option></select>)}
          {button('Translate',<Languages size={15}/>)}{translated&&<div className="oc-ai-result"><b>Translation · review before sending</b><p>{translated}</p></div>}
        </form>
        <div className="oc-card"><h3><Mic size={17}/> Voice note transcription · Saaras v4</h3>
          {field('Choose a voice note (under 30 seconds)',<input type="file" accept="audio/*" onChange={e=>setVoiceFile(e.target.files?.[0]||null)}/>)}
          <button className="oc-primary" type="button" disabled={busy||!voiceFile} onClick={transcribeVoice}><Mic size={15}/> Transcribe voice note</button>
          {transcript&&<div className="oc-ai-result"><b>Transcript · confirm before saving</b><p>{transcript}</p><button className="oc-secondary" onClick={()=>setAiPrompt(`Create administrative follow-up suggestions from this voice note. Do not infer clinical decisions: ${transcript}`)}>Use as assistant context</button></div>}
        </div>
        <div className="oc-card"><h3><Volume2 size={17}/> Spoken reminder · Bulbul v4 Flash</h3>
          {field('Approved reminder text',<textarea rows="3" value={voiceText} onChange={e=>setVoiceText(e.target.value)} placeholder="Your appointment is scheduled for…"/>)}
          <button className="oc-primary" type="button" disabled={busy||!voiceText.trim()} onClick={speakText}><Volume2 size={15}/> Generate audio</button>
          {audioUrl&&<audio controls src={audioUrl} className="oc-audio"/>}
        </div>
      </div>}
    </>}
  </section>
}
