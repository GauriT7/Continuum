import { createClient } from '@supabase/supabase-js';
import { createVoiceConfig, safeEqual, hmac, WEBHOOK_STATUSES, deriveOutcome } from '../runtime.js';
const fail=(res,status,error)=>res.status(status).json({ok:false,error});
const adminDb=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return fail(res,405,'Method not allowed.');
  const config=createVoiceConfig();
  const supplied=String(req.query?.secret||'');
  if(!config.webhookSecret||!safeEqual(supplied,config.webhookSecret))return fail(res,401,'Invalid voice webhook secret.');
  try{
    const payload=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(!payload||typeof payload!=='object'||!WEBHOOK_STATUSES.includes(payload.status)||typeof payload.attempt_id!=='string'||!payload.attempt_id)return fail(res,400,'Invalid Sarvam instant-outbound webhook payload.');
    const metadata=payload?.webhook_config?.metadata||{};
    const callId=String(metadata.call_id||'');
    if(!callId||!metadata.token)return fail(res,401,'Webhook call correlation is missing.');
    const db=adminDb();
    const {data:call,error:callError}=await db.from('voice_agent_calls').select('*').eq('id',callId).eq('attempt_id',payload.attempt_id).maybeSingle();
    if(callError)return fail(res,500,'Could not verify the call record.');
    if(!call)return fail(res,404,'No call matches this attempt.');
    if(!safeEqual(String(metadata.token),hmac(config.webhookSecret,call.id)))return fail(res,401,'Webhook call correlation failed.');
    const {error:eventError}=await db.from('voice_agent_webhook_events').insert({attempt_id:payload.attempt_id,provider_status:payload.status});
    if(eventError){
      if(eventError.code==='23505')return res.status(200).json({ok:true,duplicate:true});
      return fail(res,500,'Could not record webhook idempotency event.');
    }
    const result=deriveOutcome({payload});
    const now=new Date().toISOString();
    const update={
      status:result.status,result,provider_status:payload.status,
      interaction_id:typeof payload.interaction_id==='string'?payload.interaction_id.slice(0,200):null,
      completed_at:now,updated_at:now,
    };
    const {error:updateError}=await db.from('voice_agent_calls').update(update).eq('id',call.id);
    if(updateError){await db.from('voice_agent_webhook_events').delete().eq('attempt_id',payload.attempt_id).eq('provider_status',payload.status);return fail(res,500,'Call outcome could not be saved.');}
    if(result.optOut||result.wrongNumber){
      const {error:consentError}=await db.from('voice_agent_consents').update({
        consent_status:'revoked',opted_out:result.optOut,opted_out_at:result.optOut?now:null,
        wrong_number:result.wrongNumber,wrong_number_at:result.wrongNumber?now:null,updated_at:now,
      }).eq('patient_id',call.patient_id).eq('phone_e164',call.phone_e164);
      if(consentError){await db.from('voice_agent_webhook_events').delete().eq('attempt_id',payload.attempt_id).eq('provider_status',payload.status);return fail(res,500,'Consent and opt-out status could not be updated.');}
    }
    if(result.callbackRequested||result.rescheduleRequested||result.wrongNumber||result.optOut||result.recipientResponse==='clinical_question_redirected'||result.recipientResponse==='emergency_reported'){
      const detail=[
        'Automated call requires clinic staff follow-up.',
        'Call outcome: '+String(result.callDisposition||'unknown'),
        result.callbackRequested?'Recipient requested a callback.':'',
        result.rescheduleRequested?'Recipient requested appointment rescheduling.':'',
        result.wrongNumber?'Number reported as incorrect; verify contact details.':'',
        result.optOut?'Recipient opted out of automated calls.':'',
        result.recipientResponse==='clinical_question_redirected'?'Clinical question redirected to the care team.':'',
        result.recipientResponse==='emergency_reported'?'Recipient reported an emergency; verify staff escalation process.':'',
      ].filter(Boolean).join(' ');
      const title='Voice call requires human follow-up';
      const {data:priorTask,error:priorError}=await db.from('tasks').select('id').eq('clinic_id',call.clinic_id).eq('patient_id',call.patient_id).eq('title',title).eq('status','pending').limit(1);
      if(priorError){await db.from('voice_agent_webhook_events').delete().eq('attempt_id',payload.attempt_id).eq('provider_status',payload.status);return fail(res,500,'Human follow-up task could not be checked.');}
      if(!priorTask?.length){
        const {error:taskError}=await db.from('tasks').insert({clinic_id:call.clinic_id,patient_id:call.patient_id,title,description:detail,assigned_role:'admin',status:'pending'});
        if(taskError){await db.from('voice_agent_webhook_events').delete().eq('attempt_id',payload.attempt_id).eq('provider_status',payload.status);return fail(res,500,'Human follow-up task could not be created.');}
      }
    }
    return res.status(200).json({ok:true,status:result.status,duplicate:false});
  }catch(error){return fail(res,500,error.message||'Voice webhook failed.');}
}
