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
    const {data:call,error:ce}=await supabase.from('voice_calls').select('id,clinic_id,patient_id').eq('id',callId).single()
    if(ce||!call)return fail(res,404,'Continuum call record not found.')
    const status=b.connectivity_status||(b.completion_status==='completed'?'connected':'failed')
    const outputs=b.output_agent_variables||b.final_agent_variables||{}
    const callback=truthy(outputs.callback_requested)||truthy(outputs.needs_human_followup)\n    const optedOut=truthy(outputs.opt_out_requested)
    const outcome=String(outputs.call_outcome||outputs.call_disposition||status).slice(0,100)
    const {error:ae}=await supabase.from('voice_call_attempts').upsert({
      voice_call_id:callId,clinic_id:call.clinic_id,sarvam_attempt_id:b.attempt_id,
      connectivity_status:status,completion_status:b.completion_status||null,
      duration:b.duration??null,interaction_id:b.interaction_id||null,
      failure_reason:b.failure_reason||null,transcript:b.interaction_transcript||null,
      output_variables:outputs,executed_at:b.executed_at||b.end_datetime||new Date().toISOString()
    },{onConflict:'sarvam_attempt_id'})
    if(ae)return fail(res,500,ae.message)
    const finalStatus=status==='connected'?'completed':b.next_action_status?'retrying':status==='busy'?'busy':status==='no_answer'?'no_answer':'failed'
    const {error:ue}=await supabase.from('voice_calls').update({
      status:finalStatus,call_outcome:outcome,call_duration:b.duration??null,
      callback_requested:callback,failure_reason:b.failure_reason||null,
      completed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }).eq('id',callId)
    if(ue)return fail(res,500,ue.message)
    if(optedOut){
      await supabase.from('voice_contact_preferences').update({
        consent_status:'revoked',consent_at:null,updated_at:new Date().toISOString()
      }).eq('patient_id',call.patient_id)
      await supabase.from('voice_calls').update({
        status:'blocked',failure_reason:'Patient opted out during the call.',updated_at:new Date().toISOString()
      }).eq('patient_id',call.patient_id).eq('status','scheduled')
    }
    if(callback){
      const title='Patient requested a callback after an automated call'
      const {data:existing}=await supabase.from('tasks').select('id').eq('clinic_id',call.clinic_id).eq('patient_id',call.patient_id).eq('title',title).eq('status','pending').limit(1)
      if(!existing?.length)await supabase.from('tasks').insert({clinic_id:call.clinic_id,patient_id:call.patient_id,title,description:`Voice call outcome: ${outcome}. Please review and contact the patient. No clinical inference has been made.`,assigned_role:'admin',status:'pending'})
    }
    return res.status(200).json({ok:true})
  }catch(e){return fail(res,500,e.message||'Webhook processing failed.')}
}
