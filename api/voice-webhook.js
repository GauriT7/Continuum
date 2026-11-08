import { createClient } from '@supabase/supabase-js'

const fail=(res,status,error)=>res.status(status).json({ok:false,error})
const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const truthy=v=>v===true||v==='true'||v==='yes'||v==='YES'||v===1
const shortText=(v,max)=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)

const outcomes=new Set([
  'appointment_confirmed','appointment_declined','reschedule_requested',
  'documents_commitment_received','documents_not_available','followup_accepted',
  'followup_declined','callback_requested','opt_out','wrong_number',
  'third_party_reached','voicemail_left','no_answer','no_response',
  'incomplete','technical_failure'
])
const reasons=new Set(['administrative','documents','billing','clinical','complaint','other','not_applicable'])
const flagsAllowed=new Set([
  'clinical_question','distress','emergency_line_given','complaint',
  'record_error','third_party_optout','language_unsupported','repeated_no_response'
])
const enumValue=(v,allowed,fallback)=>allowed.has(String(v||''))?String(v):fallback

function sanitiseOutputs(raw,callId,providerDuration){
  const rawCommitments=raw.commitments&&typeof raw.commitments==='object'?raw.commitments:{}
  const attending=enumValue(rawCommitments.attending,new Set(['yes','no','unsure','not_discussed']),'not_discussed')
  const timeWindow=enumValue(rawCommitments.preferred_time_window,new Set(['morning','afternoon','evening','any','not_discussed']),'not_discussed')
  const documents=Array.isArray(rawCommitments.documents_to_bring)
    ? rawCommitments.documents_to_bring.slice(0,10).map(x=>shortText(x,100)).filter(Boolean) : []
  const days=Array.isArray(rawCommitments.preferred_days)
    ? rawCommitments.preferred_days.slice(0,7).map(x=>shortText(x,30)).filter(Boolean) : []
  const flags=Array.isArray(raw.flags)
    ? [...new Set(raw.flags.map(String).filter(x=>flagsAllowed.has(x)))] : []
  const reason=enumValue(raw.callback_reason_category,reasons,'other')
  const outcome=enumValue(raw.call_outcome,outcomes,'incomplete')
  const clinicalOrDistress=reason==='clinical'||flags.some(x=>['clinical_question','distress','emergency_line_given'].includes(x))
  const staffNote=clinicalOrDistress?null:shortText(raw.staff_note,300)||null
  const numeric=(value,max)=>Number.isInteger(Number(value))?Math.max(0,Math.min(max,Number(value))):null
  return {
    continuum_call_id:callId,
    call_outcome:outcome,
    callback_requested:truthy(raw.callback_requested)||outcome==='callback_requested',
    needs_human_followup:truthy(raw.needs_human_followup)||clinicalOrDistress||reason==='complaint'||flags.includes('complaint')||flags.includes('record_error'),
    opt_out_requested:truthy(raw.opt_out_requested)||outcome==='opt_out'||flags.includes('third_party_optout'),
    identity_verified:truthy(raw.identity_verified),
    language_used:enumValue(raw.language_used,new Set(['mr-IN','hi-IN','en-IN','other']),'other'),
    callback_reason_category:reason,
    callback_window:shortText(raw.callback_window,120)||null,
    callback_number_confirmed:truthy(raw.callback_number_confirmed),
    commitments:{
      attending,
      documents_to_bring:documents,
      preferred_days:days,
      preferred_time_window:timeWindow
    },
    staff_note:staffNote,
    flags,
    turn_count:numeric(raw.turn_count,500),
    duration_seconds:numeric(raw.duration_seconds??providerDuration,240),
    transcript_ref:shortText(raw.transcript_ref,500)||null
  }
}

export default async function handler(req,res){
  if(req.method!=='POST')return fail(res,405,'Method not allowed.')
  if(!process.env.VOICE_WEBHOOK_SECRET||String(req.query?.token||'')!==process.env.VOICE_WEBHOOK_SECRET)return fail(res,401,'Invalid webhook token.')
  try{
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})
    const callId=b.user_identifier||b.metadata?.continuum_call_id||b.continuum_call_id
    if(!callId||!b.attempt_id)return fail(res,400,'Missing call ID or attempt ID.')
    const supabase=db()
    const {data:call,error:ce}=await supabase.from('voice_calls')
      .select('id,clinic_id,patient_id,attempt_count,status').eq('id',callId).single()
    if(ce||!call)return fail(res,404,'Continuum call record not found.')
    const nextAttemptCount=Number(call.attempt_count||0)+1

    // The stored attempt ID is an idempotency key; duplicate provider delivery is acknowledged.
    const {data:existingAttempt,error:existingError}=await supabase.from('voice_call_attempts')
      .select('id').eq('sarvam_attempt_id',b.attempt_id).maybeSingle()
    if(existingError)return fail(res,500,existingError.message)
    if(existingAttempt)return res.status(200).json({ok:true,duplicate:true})

    const connectivity=String(b.connectivity_status||'').toLowerCase()
    const outputs=sanitiseOutputs(b.output_agent_variables||b.final_agent_variables||{},callId,b.duration)
    const optedOut=outputs.opt_out_requested
    const callback=outputs.callback_requested||outputs.needs_human_followup||
      (['busy','no_answer'].includes(connectivity)&&Number(call.attempt_count||0)>=2)
    const outcome=outputs.call_outcome
    const {error:attemptError}=await supabase.from('voice_call_attempts').insert({
      voice_call_id:callId,clinic_id:call.clinic_id,sarvam_attempt_id:String(b.attempt_id).slice(0,200),
      connectivity_status:connectivity||null,completion_status:b.completion_status||null,
      duration:outputs.duration_seconds,interaction_id:b.interaction_id?String(b.interaction_id).slice(0,200):null,
      failure_reason:shortText(b.failure_reason,300)||null,
      transcript:outputs.transcript_ref?{transcript_ref:outputs.transcript_ref}:null,
      output_variables:outputs,executed_at:b.executed_at||b.end_datetime||new Date().toISOString()
    })
    if(attemptError)return fail(res,500,attemptError.message)

    const now=new Date()
    let nextStatus=b.completion_status==='completed'?'completed':'failed'
    let nextScheduledAt=null
    if(!optedOut&&['busy','no_answer'].includes(connectivity)){
      if(Number(call.attempt_count||0)<2){
        nextStatus='scheduled'
        nextScheduledAt=new Date(now.getTime()+48*60*60*1000).toISOString()
      }
    }

    // Stop future automated calls before closing this attempt.
    if(optedOut||outcome==='wrong_number'){
      const {error:revokeError}=await supabase.from('voice_contact_preferences').update({
        consent_status:'revoked',consent_at:null,updated_at:now.toISOString()
      }).eq('patient_id',call.patient_id).eq('clinic_id',call.clinic_id)
      if(revokeError)return fail(res,500,revokeError.message)
      const {data:preference,error:preferenceError}=await supabase.from('voice_contact_preferences').select('phone_e164,consent_recorded_by,contact_is_parent_guardian').eq('patient_id',call.patient_id).eq('clinic_id',call.clinic_id).maybeSingle()
      if(preferenceError)return fail(res,500,preferenceError.message)
      if(preference?.phone_e164) {
        const {data:existingConsent,error:existingConsentError}=await supabase.from('voice_agent_consents').select('id,consent_source,consent_recorded_by,guardian_confirmed,opted_out,opted_out_at,wrong_number,wrong_number_at').eq('patient_id',call.patient_id).eq('phone_e164',preference.phone_e164).maybeSingle()
        if(existingConsentError)return fail(res,500,existingConsentError.message)
        // Campaign-originated opt-outs must also block the instant-call path.
        // Do not insert a synthetic consent row here: the instant consent schema
        // requires a real staff recorder and an explicit consent source.
        if(existingConsent){
          const {error:syncError}=await supabase.from('voice_agent_consents').update({
            consent_status:'revoked',
            consent_recorded_at:now.toISOString(),
            opted_out:optedOut||existingConsent.opted_out===true,
            opted_out_at:optedOut?now.toISOString():existingConsent.opted_out_at,
            wrong_number:outcome==='wrong_number'||existingConsent.wrong_number===true,
            wrong_number_at:outcome==='wrong_number'?now.toISOString():existingConsent.wrong_number_at,
            updated_at:now.toISOString()
          }).eq('id',existingConsent.id)
          if(syncError)return fail(res,500,'Could not synchronize the opt-out / wrong-number block.')
        }
      }
      const {error:blockError}=await supabase.from('voice_calls').update({
        status:'blocked',failure_reason:optedOut?'Patient or authorised family member opted out.':'Wrong number; clinic must re-verify contact details.',updated_at:now.toISOString()
      }).eq('patient_id',call.patient_id).eq('clinic_id',call.clinic_id)
       .in('status',['scheduled','dispatching','queued','retrying']).neq('id',callId)
      if(blockError)return fail(res,500,blockError.message)
      nextStatus='completed'
    }

    const update={
      status:nextStatus,call_outcome:outcome,call_duration:outputs.duration_seconds,
      attempt_count:nextAttemptCount,
      callback_requested:outputs.callback_requested,failure_reason:shortText(b.failure_reason,300)||null,
      completed_at:nextStatus==='scheduled'?null:now.toISOString(),updated_at:now.toISOString()
    }
    if(nextScheduledAt)update.scheduled_at=nextScheduledAt
    const {error:updateError}=await supabase.from('voice_calls').update(update).eq('id',callId)
    if(updateError)return fail(res,500,updateError.message)

    if(callback){
      const title='Voice coordinator callback / human follow-up'
      const flags=outputs.flags
      const clinical=outputs.callback_reason_category==='clinical'||
        flags.some(x=>['clinical_question','emergency_line_given','distress'].includes(x))
      const staffNote=clinical
        ? 'Same-working-day clinical callback required. Do not assess or respond through this workflow.'
        : outputs.staff_note||'Clinic staff follow-up requested.'
      const details=[
        'Call outcome: '+outcome,
        outputs.callback_reason_category!=='not_applicable'?'Follow-up category: '+outputs.callback_reason_category:'',
        outputs.callback_window?'Preferred callback window: '+outputs.callback_window:'',
        outputs.callback_number_confirmed?'Callback number confirmed.':'Callback number not confirmed.',
        staffNote
      ].filter(Boolean).join('\n').slice(0,900)
      const {data:existingTask,error:taskLookupError}=await supabase.from('tasks').select('id')
        .eq('clinic_id',call.clinic_id).eq('patient_id',call.patient_id).eq('title',title).eq('status','pending').limit(1)
      if(taskLookupError)return fail(res,500,taskLookupError.message)
      if(!existingTask?.length){
        const {error:taskError}=await supabase.from('tasks').insert({
          clinic_id:call.clinic_id,patient_id:call.patient_id,title,
          description:details,assigned_role:'admin',status:'pending'
        })
        if(taskError)return fail(res,500,taskError.message)
      }
    }
    return res.status(200).json({ok:true,status:nextStatus,opt_out_applied:optedOut})
  }catch(e){return fail(res,500,e.message||'Webhook processing failed.')}
}
