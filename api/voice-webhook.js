import { createClient } from '@supabase/supabase-js'

const fail=(res,status,error)=>res.status(status).json({ok:false,error})
const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const truthy=v=>v===true||v==='true'||v==='yes'||v==='YES'||v===1

export default async function handler(req,res){
  if(req.method!=='POST')return fail(res,405,'Method not allowed.')
  if(!process.env.VOICE_WEBHOOK_SECRET||String(req.query?.token||'')!==process.env.VOICE_WEBHOOK_SECRET)return fail(res,401,'Invalid webhook token.')
  try{
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})
    const callId=b.user_identifier||b.metadata?.continuum_call_id
    if(!callId||!b.attempt_id)return fail(res,400,'Missing call ID or attempt ID.')
    const supabase=db()
    const {data:call,error:ce}=await supabase.from('voice_calls')
      .select('id,clinic_id,patient_id,attempt_count,status').eq('id',callId).single()
    if(ce||!call)return fail(res,404,'Continuum call record not found.')

    // Webhooks may be redelivered. Do not duplicate retries or staff follow-up tasks.
    const {data:existingAttempt,error:existingError}=await supabase.from('voice_call_attempts')
      .select('id').eq('sarvam_attempt_id',b.attempt_id).maybeSingle()
    if(existingError)return fail(res,500,existingError.message)
    if(existingAttempt)return res.status(200).json({ok:true,duplicate:true})

    const status=b.connectivity_status||(b.completion_status==='completed'?'connected':'failed')
    const outputs=b.output_agent_variables||b.final_agent_variables||{}
    const callbackRequested=truthy(outputs.callback_requested)
    const needsHuman=truthy(outputs.needs_human_followup)
    const optedOut=truthy(outputs.opt_out_requested)
    const callback=callbackRequested||needsHuman
    const outcome=String(outputs.call_outcome||outputs.call_disposition||status).slice(0,100)
    const {error:attemptError}=await supabase.from('voice_call_attempts').insert({
      voice_call_id:callId,clinic_id:call.clinic_id,sarvam_attempt_id:b.attempt_id,
      connectivity_status:status,completion_status:b.completion_status||null,
      duration:b.duration??null,interaction_id:b.interaction_id||null,
      failure_reason:b.failure_reason||null,
      transcript:outputs.transcript_ref?{transcript_ref:String(outputs.transcript_ref).slice(0,500)}:null,
      output_variables:outputs,executed_at:b.executed_at||b.end_datetime||new Date().toISOString()
    })
    if(attemptError)return fail(res,500,attemptError.message)

    const now=new Date()
    let nextStatus=b.completion_status==='completed'?'completed':'failed'
    let nextScheduledAt=null
    if(!optedOut&&['busy','no_answer'].includes(status)){
      if(Number(call.attempt_count||0)<2){
        nextStatus='scheduled'
        nextScheduledAt=new Date(now.getTime()+48*60*60*1000).toISOString()
      }else{
        nextStatus='failed'
      }
    }

    // Revoke first; future scheduled calls are blocked before this call is closed.
    if(optedOut){
      const {error:revokeError}=await supabase.from('voice_contact_preferences').update({
        consent_status:'revoked',consent_at:null,updated_at:now.toISOString()
      }).eq('patient_id',call.patient_id).eq('clinic_id',call.clinic_id)
      if(revokeError)return fail(res,500,revokeError.message)
      const {error:blockError}=await supabase.from('voice_calls').update({
        status:'blocked',failure_reason:'Patient or authorised family member opted out.',updated_at:now.toISOString()
      }).eq('patient_id',call.patient_id).eq('clinic_id',call.clinic_id).eq('status','scheduled').neq('id',callId)
      if(blockError)return fail(res,500,blockError.message)
      nextStatus='completed'
    }

    const update={
      status:nextStatus,call_outcome:outcome,call_duration:b.duration??null,
      callback_requested:callbackRequested,failure_reason:b.failure_reason||null,
      completed_at:nextStatus==='scheduled'?null:now.toISOString(),updated_at:now.toISOString()
    }
    if(nextScheduledAt)update.scheduled_at=nextScheduledAt
    const {error:updateError}=await supabase.from('voice_calls').update(update).eq('id',callId)
    if(updateError)return fail(res,500,updateError.message)

    if(callback){
      const title='Voice coordinator callback / human follow-up'
      const reason=String(outputs.callback_reason_category||'other').toLowerCase()
      const flags=Array.isArray(outputs.flags)?outputs.flags:[]
      const clinical=reason==='clinical'||flags.some(x=>['clinical_question','emergency_line_given','distress'].includes(String(x)))
      const staffNote=clinical
        ? 'Clinical concern or question flagged for clinic follow-up. Do not assess or respond through this workflow.'
        : String(outputs.staff_note||'').replace(/\s+/g,' ').trim().slice(0,300)
      const callbackWindow=String(outputs.callback_window||'').replace(/\s+/g,' ').trim().slice(0,120)
      const details=[
        'Call outcome: '+outcome,
        callbackWindow?'Preferred callback window: '+callbackWindow:'',
        staffNote?'Non-clinical staff note: '+staffNote:''
      ].filter(Boolean).join('\n')
      const {data:existingTask,error:taskLookupError}=await supabase.from('tasks').select('id')
        .eq('clinic_id',call.clinic_id).eq('patient_id',call.patient_id).eq('title',title).eq('status','pending').limit(1)
      if(taskLookupError)return fail(res,500,taskLookupError.message)
      if(!existingTask?.length){
        const {error:taskError}=await supabase.from('tasks').insert({
          clinic_id:call.clinic_id,patient_id:call.patient_id,title,
          description:details.slice(0,900),assigned_role:'admin',status:'pending'
        })
        if(taskError)return fail(res,500,taskError.message)
      }
    }
    return res.status(200).json({ok:true,status:nextStatus,opt_out_applied:optedOut})
  }catch(e){return fail(res,500,e.message||'Webhook processing failed.')}
}
