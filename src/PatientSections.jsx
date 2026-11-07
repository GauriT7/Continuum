import React, { useState } from 'react'
import { ArrowRight, CalendarDays, Check, FileText, MessageCircle, Plus, UploadCloud } from 'lucide-react'

function saveCalendarInvite(){
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Continuum//Appointment//EN',
    'BEGIN:VEVENT','UID:continuum-demo-appointment-20261113@example.invalid',
    'DTSTAMP:20261107T000000Z','DTSTART;TZID=Asia/Kolkata:20261113T103000',
    'DTEND;TZID=Asia/Kolkata:20261113T110000','SUMMARY:Continuum clinic appointment',
    'DESCRIPTION:Demo appointment reminder. Please contact your clinic for changes.',
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}))
  const link = document.createElement('a')
  link.href = url
  link.download = 'continuum-appointment.ics'
  link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export default function PatientSections({section,tasks,toggle,setShowAdd,notify,setSection,savedDrafts,setSavedDrafts}){
  const [selectedFile,setSelectedFile]=useState(null)
  const [draft,setDraft]=useState('')
  const title={checklist:'Your checklist',documents:'Your documents',appointments:'Appointments',messages:'Messages'}[section]||'My journey'
  const subtitle={checklist:'Your next steps, all in one calm place.',documents:'Keep the documents you may want to share with your care team in view.',appointments:'Your upcoming clinic visit and calendar details.',messages:'A simple place to prepare a message for your care team.'}[section]||''
  return <div className="patient-subpage">
    <div className="patient-subpage-head">
      <div><div className="eyebrow">MY JOURNEY · YOUR SPACE</div><h1>{title}</h1><p>{subtitle}</p></div>
      <button className="patient-action secondary" onClick={()=>setSection('overview')}><ArrowRight size={14}/> Back to overview</button>
    </div>
    {section==='checklist'&&<div className="patient-subpage-grid">
      <section className="panel"><div className="section-head"><div><div className="eyebrow">YOUR NEXT STEPS</div><h2>Checklist <span className="count-chip">{tasks.filter(t=>!t.done).length} left</span></h2></div><button className="text-link" onClick={()=>setShowAdd(true)}><Plus size={14}/> Add a task</button></div>
        <div className="patient-task-list">{tasks.map(t=><div className="patient-task" key={t.id}><button className={'check-circle '+(t.done?'is-complete':'')} onClick={()=>toggle(t.id)} aria-label={t.done?'Mark as incomplete':'Mark as complete'}>{t.done&&<Check size={13}/>}</button><div className="task-text"><b>{t.title}</b><small>{t.detail}</small></div><span className="task-date">{t.date}</span></div>)}</div>
      </section>
      <aside className="panel"><div className="eyebrow">A GENTLE REMINDER</div><h2>One step at a time.</h2><p className="patient-note">You can complete these tasks at your own pace. Your care team can help clarify administrative steps.</p></aside>
    </div>}
    {section==='documents'&&<div className="patient-subpage-grid">
      <section className="panel"><div className="section-head"><div><div className="eyebrow">DOCUMENT CHECKLIST</div><h2>Documents to keep handy</h2></div><FileText size={19}/></div>
        {[['Recent laboratory report','Requested for your clinic file','Pending'],['Previous consultation summary','Bring it to your next visit','Ready'],['Partner document','Share separately when requested','Pending']].map(([name,desc,status])=><div className="patient-doc-row" key={name}><span className="patient-doc-icon"><FileText size={17}/></span><div className="patient-doc-copy"><b>{name}</b><small>{desc}</small></div><span className={status==='Ready'?'status-pill':'count-chip'}>{status}</span></div>)}
      </section>
      <aside className="panel"><div className="eyebrow">ATTACHMENT PREVIEW</div><h2>Choose a file</h2><p className="patient-note">This demo portal can preview a file selection, but does not upload documents. Share it through your clinic's approved secure channel.</p>
        <label className="patient-action secondary" style={{marginTop:12,cursor:'pointer'}}><UploadCloud size={15}/> Select a file<input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={e=>setSelectedFile(e.target.files?.[0]||null)}/></label>
        {selectedFile&&<div className="patient-note" style={{marginTop:12}}><b>Selected:</b> {selectedFile.name}</div>}
      </aside>
    </div>}
    {section==='appointments'&&<div className="patient-subpage-grid">
      <section className="panel"><div className="eyebrow">UPCOMING APPOINTMENT</div><h2 style={{margin:'8px 0'}}>Friday · 13 November · 10:30 AM</h2><p className="muted">Dr. Nisha Shah · Continuum Clinic</p><div className="patient-note">This is a demo appointment record. Contact your clinic directly to confirm or change the appointment.</div><div style={{display:'flex',gap:9,flexWrap:'wrap',marginTop:16}}><button className="patient-action" onClick={saveCalendarInvite}><CalendarDays size={15}/> Add to calendar</button><button className="patient-action secondary" onClick={()=>setSection('messages')}><MessageCircle size={15}/> Request a change</button></div></section>
      <aside className="panel"><div className="eyebrow">BEFORE YOU VISIT</div><h2>Keep it simple.</h2><p className="patient-note">Keep any requested documents together and contact the clinic if you need help with appointment logistics.</p></aside>
    </div>}
    {section==='messages'&&<div className="patient-subpage-grid">
      <section className="panel"><div className="eyebrow">MESSAGE YOUR CARE TEAM</div><h2 style={{margin:'8px 0 14px'}}>Prepare a message</h2><form className="patient-form" onSubmit={e=>{e.preventDefault();if(!draft.trim())return;setSavedDrafts(items=>[{id:Date.now(),text:draft.trim()},...items]);setDraft('');notify('Message draft saved in this demo session.')}}><label>Your message<textarea required maxLength={1000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write an administrative question or request…"/></label><button className="patient-action" type="submit"><Check size={15}/> Save draft</button></form><p className="patient-note" style={{marginTop:12}}>Demo only: drafts are kept in this browser session and are not delivered to the clinic.</p></section>
      <aside className="panel"><div className="eyebrow">SAVED DRAFTS</div><h2>Drafts from this session</h2>{savedDrafts.length?savedDrafts.map(item=><div className="patient-message-row" key={item.id}><span className="patient-doc-icon"><MessageCircle size={16}/></span><div className="patient-doc-copy"><b>Message draft</b><small>{item.text}</small></div></div>):<div className="patient-empty">Your saved drafts will appear here.</div>}</aside>
    </div>}
  </div>
}
