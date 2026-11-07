import React, { useMemo, useState } from 'react'
import {
  Users, HeartHandshake, ListChecks, CalendarDays, FileText, Sparkles,
  PhoneCall, Smartphone, Check, Circle, ShieldCheck, Play, Languages,
  BellRing, Database, Mic, ArrowRight, Info
} from 'lucide-react'

const sections = [
  ['patients','People',Users], ['journeys','Journeys',HeartHandshake],
  ['tasks','Tasks',ListChecks], ['appointments','Appointments',CalendarDays],
  ['documents','Documents',FileText], ['ai','Sarvam AI',Sparkles],
  ['voice','Voice & Outreach',PhoneCall], ['integrations','Integrations',Smartphone]
]

const starterTasks = [
  { id: 1, title: 'Review uploaded laboratory report', person: 'Ananya Mehta', owner: 'Clinic coordinator', done: false },
  { id: 2, title: 'Confirm Friday appointment', person: 'Priya Kulkarni', owner: 'Front desk', done: false },
  { id: 3, title: 'Check partner document status', person: 'Sana Khan', owner: 'Care coordinator', done: true }
]

export default function DemoOperationsPreview({ initialTab = 'patients' }) {
  const [tab, setTab] = useState(initialTab)
  const [tasks, setTasks] = useState(starterTasks)
  const [newTask, setNewTask] = useState('')
  const [prompt, setPrompt] = useState('A patient has uploaded a report and a partner document is still outstanding.')
  const [aiPreview, setAiPreview] = useState(false)
  const [voiceSimulated, setVoiceSimulated] = useState(false)
  const [appointmentState, setAppointmentState] = useState('Scheduled')

  const openTasks = useMemo(() => tasks.filter(t => !t.done).length, [tasks])

  return <section className="oc-wrap demo-operations">
    <div className="oc-heading">
      <div>
        <div className="eyebrow">CONTINUUM OPERATIONS · GUEST PREVIEW</div>
        <h2>One place to keep every care loop moving.</h2>
        <p>Explore the workflow using fictional sample records. All interactions on this page are local simulations.</p>
      </div>
      <span className="oc-pill">DEMO MODE</span>
    </div>
    <div className="oc-notice"><ShieldCheck size={15}/> No live patient records, file uploads, messages, reminders or phone calls are used in this guest workspace.</div>
    <div className="oc-tabs">
      {sections.map(([id,label,Icon]) => <button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={15}/>{label}</button>)}
    </div>

    {tab==='patients' && <div className="oc-grid">
      <div className="oc-card">
        <div className="oc-card-head"><h3><Users size={17}/> People in this clinic</h3><span>3 sample records</span></div>
        {[
          ['Ananya Mehta','ML-DEMO-2048','Fertility care','Dr. N. Shah','72%'],
          ['Priya Kulkarni','ML-DEMO-2051','Antenatal care','Sister R. Patil','86%'],
          ['Sana Khan','ML-DEMO-2055','Fertility care','Dr. N. Shah','48%']
        ].map(([name,id,journey,owner,progress])=><div className="oc-row" key={id}>
          <div className="oc-avatar">{name.split(' ').map(x=>x[0]).join('')}</div>
          <div className="oc-row-main"><b>{name}</b><small>{id} · {journey} · {owner}</small></div>
          <span className="oc-pill">{progress}</span>
        </div>)}
      </div>
      <div className="oc-card">
        <h3><Info size={17}/> What the workflow captures</h3>
        <p className="oc-help">A shared administrative view of people, care journeys, assigned tasks, appointment coordination and incoming documents.</p>
        <div className="oc-row"><div className="oc-row-main"><b>Clinic-scoped access</b><small>Staff identity and clinic membership checks</small></div><ShieldCheck size={16}/></div>
        <div className="oc-row"><div className="oc-row-main"><b>Human review</b><small>Extracted document fields are drafts until confirmed</small></div><Check size={16}/></div>
      </div>
    </div>}

    {tab==='journeys' && <div className="oc-grid">
      {[
        ['Ananya Mehta','Fertility care','Investigations','72%'],
        ['Priya Kulkarni','Antenatal care','Routine follow-up','86%'],
        ['Sana Khan','Fertility care','Partner document pending','48%']
      ].map(([name,type,next,progress])=><div className="oc-card" key={name}>
        <div className="oc-card-head"><h3><HeartHandshake size={17}/> {type}</h3><span className="oc-pill">Active</span></div>
        <b>{name}</b><p className="oc-help">Next step · {next}</p>
        <div className="demo-progress"><span style={{width:progress}}/></div><small className="oc-muted">{progress} journey checklist progress · illustrative only</small>
      </div>)}
    </div>}

    {tab==='tasks' && <div className="oc-grid">
      <div className="oc-card">
        <div className="oc-card-head"><h3><ListChecks size={17}/> Shared task queue</h3><span>{openTasks} open</span></div>
        {tasks.map(task=><div className="oc-row" key={task.id}>
          <button className={'oc-check '+(task.done?'done':'')} onClick={()=>setTasks(items=>items.map(t=>t.id===task.id?{...t,done:!t.done}:t))} aria-label={task.done?'Mark task open':'Complete task'}>{task.done?<Check size={14}/>:<Circle size={16}/>}</button>
          <div className="oc-row-main"><b className={task.done?'oc-strike':''}>{task.title}</b><small>{task.person} · {task.owner}</small></div>
          <span className={'oc-pill '+(task.done?'completed':'pending')}>{task.done?'Completed':'Pending'}</span>
        </div>)}
      </div>
      <form className="oc-card" onSubmit={e=>{e.preventDefault();if(!newTask.trim())return;setTasks(items=>[{id:Date.now(),title:newTask.trim(),person:'Demo clinic',owner:'Unassigned',done:false},...items]);setNewTask('')}}>
        <h3><ListChecks size={17}/> Add a sample task</h3>
        <label className="oc-field"><span>Task title</span><input value={newTask} onChange={e=>setNewTask(e.target.value)} placeholder="e.g. Check appointment confirmation"/></label>
        <button className="oc-primary" type="submit" disabled={!newTask.trim()}><Check size={15}/> Add to demo queue</button>
        <p className="oc-help">This task exists only in your current browser session.</p>
      </form>
    </div>}

    {tab==='appointments' && <div className="oc-grid">
      <div className="oc-card">
        <div className="oc-card-head"><h3><CalendarDays size={17}/> Appointment coordination</h3><span className="oc-pill">{appointmentState}</span></div>
        <b>Priya Kulkarni · Antenatal follow-up</b>
        <p className="oc-help">Friday, 13 November · 10:30 AM · Continuum Clinic</p>
        <div className="oc-row"><div className="oc-row-main"><b>Reminder status</b><small>Preview only · no device notification is sent</small></div><BellRing size={16}/></div>
        <button className="oc-secondary" onClick={()=>setAppointmentState(s=>s==='Scheduled'?'Confirmed (demo)':'Scheduled')}><Check size={14}/> Toggle sample confirmation</button>
      </div>
      <div className="oc-card"><h3><Info size={17}/> Appointment workflow</h3><p className="oc-help">Coordinate visit dates, record attendance status, and prepare patient-authorised reminders. Live delivery requires the clinic's configured notification service.</p></div>
    </div>}

    {tab==='documents' && <div className="oc-grid">
      <div className="oc-card">
        <div className="oc-card-head"><h3><FileText size={17}/> Document inbox</h3><span>2 sample files</span></div>
        {[
          ['sample-laboratory-report.pdf','Ananya Mehta','Awaiting staff review'],
          ['sample-consultation-summary.pdf','Priya Kulkarni','Reviewed']
        ].map(([file,person,status])=><div className="oc-row" key={file}><div className="oc-row-main"><b>{file}</b><small>{person}</small></div><span className="oc-pill">{status}</span></div>)}
      </div>
      <div className="oc-card"><h3><ShieldCheck size={17}/> Human-in-the-loop review</h3><p className="oc-help">Document AI can prepare draft classifications and extracted metadata. A staff member checks the source document and explicitly confirms fields before they are saved.</p><p className="oc-help">Guest preview does not accept or upload files.</p></div>
    </div>}

    {tab==='ai' && <div className="oc-grid">
      <div className="oc-card">
        <h3><Sparkles size={17}/> Workflow assistant · preview</h3>
        <label className="oc-field"><span>What needs organising?</span><textarea rows="4" value={prompt} onChange={e=>{setPrompt(e.target.value);setAiPreview(false)}}/></label>
        <button className="oc-primary" onClick={()=>setAiPreview(true)} disabled={!prompt.trim()}><Sparkles size={15}/> Preview a sample suggestion</button>
        {aiPreview&&<div className="oc-ai-result"><b>Illustrative administrative suggestions</b><p>1. Add a task for the clinic coordinator to review the uploaded document.</p><p>2. Create a follow-up for the outstanding partner document.</p><p>3. Ask the care team to confirm the next appointment.</p><small>Static preview · no AI service was called and no clinical recommendation was generated.</small></div>}
      </div>
      <div className="oc-card"><h3><Languages size={17}/> Multilingual communication</h3><p className="oc-help">The staff workflow includes translation and speech tools for preparing administrative communication in supported Indian languages.</p><div className="oc-row"><div className="oc-row-main"><b>Translation</b><small>Draft → review → approve</small></div><Languages size={16}/></div><div className="oc-row"><div className="oc-row-main"><b>Speech-to-text / text-to-speech</b><small>Staff-reviewed output</small></div><Mic size={16}/></div></div>
    </div>}

    {tab==='voice' && <div className="oc-grid">
      <div className="oc-card">
        <h3><PhoneCall size={17}/> Voice outreach · simulation</h3>
        <p className="oc-help">Preview the steps in a consent-aware administrative call. This does not connect to a phone network.</p>
        <div className="oc-row"><div className="oc-row-main"><b>1 · Verify consent and recipient</b><small>Confirm the approved contact and communication preference</small></div><ShieldCheck size={16}/></div>
        <div className="oc-row"><div className="oc-row-main"><b>2 · Use the approved reminder</b><small>Administrative wording only · no clinical advice</small></div><Check size={16}/></div>
        <div className="oc-row"><div className="oc-row-main"><b>3 · Record outcome for staff review</b><small>Retry limits and opt-out handling apply to the live workflow</small></div><FileText size={16}/></div>
        <button className="oc-primary" onClick={()=>setVoiceSimulated(true)}><Play size={15}/> Run call simulation</button>
        {voiceSimulated&&<div className="oc-ai-result"><b><Check size={14}/> Simulation completed</b><p>“Hello. This is a reminder from your clinic about your upcoming appointment. Please contact the clinic if you need to make a change.”</p><small>Simulated outcome · no call, SMS or patient contact occurred.</small></div>}
      </div>
      <div className="oc-card"><h3><ShieldCheck size={17}/> Safety gates</h3><p className="oc-help">The live workflow is designed around explicit consent, guardian checks where applicable, approved calling windows, opt-out handling and staff follow-up.</p><span className="oc-pill">Live calling disabled in guest mode</span></div>
    </div>}

    {tab==='integrations' && <div className="oc-grid">
      {[
        [Database,'Supabase','Staff authentication and clinic-scoped records','Environment and API deployment validation required','Review'],
        [Sparkles,'Sarvam AI','Speech, translation and document workflow tools','Backend route migration and credentials required','Preview only'],
        [BellRing,'Web Push','Appointment and task reminders to registered devices','VAPID setup and server-side delivery required','Not sent'],
        [PhoneCall,'Voice agent','Consent-led administrative voice outreach','Live calling remains disabled until clinic sign-off','Simulation'],
        [Smartphone,'ABDM','Sandbox readiness check in current build','No live ABHA / HIU / HIP health-record exchange','Sandbox only']
      ].map(([Icon,name,what,condition,status])=><div className="oc-card demo-integration-card" key={name}>
        <div className="demo-integration-icon"><Icon size={18}/></div><div className="oc-card-head"><h3>{name}</h3><span className="oc-pill">{status}</span></div><p>{what}</p><small>{condition}</small>
      </div>)}
      <div className="oc-notice"><Info size={15}/> This panel describes capabilities in the repository, not a claim that every production connector is currently live on Netlify.</div>
    </div>}
  </section>
}
