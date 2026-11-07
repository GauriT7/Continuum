import { requireVoiceStaff,fail,bodyOf,getPatientForStaff,latestConsent,publicCall } from '../../../../api/_lib/voice-agent.js';
import { createVoiceConfig,normalizePhone,validateMessage,calculateAge,evaluateCallingWindow,sha256,LANGUAGES,buildInstantOutboundRequest } from '../runtime.js';
import { createSarvamInstantOutbound } from '../runtime.js';
export const config={maxDuration:30};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return fail(res,405,'Method not allowed.');
 try{
  const {user,clinicIds,db}=await requireVoiceStaff(req);
  if(req.method==='GET'){
   let q=db.from('voice_agent_calls').select('*').in('clinic_id',clinicIds).order('created_at',{ascending:false}).limit(50);
   if(req.query?.patient_id)q=q.eq('patient_id',String(req.query.patient_id));
   const {data,error}=await q;if(error)return fail(res,400,error.message);
   return res.status(200).json({ok:true,calls:(data||[]).map(publicCall)});
  }
  const b=bodyOf(req);
  if(b.confirm!==true)return fail(res,400,'Confirm the recipient number and exact approved message.','confirmation_required');
  const mode=b.mode==='live'?'live':'simulated';
  const patient=await getPatientForStaff(db,b.patient_id,clinicIds),phone=normalizePhone(patient.phone);
  if(!phone.ok)return fail(res,422,phone.error,'invalid_phone');
  const parsed=validateMessage(b.message);
  if(!parsed.ok)return fail(res,422,parsed.error,parsed.code);
  if(typeof b.approved_message!=='string'||b.approved_message!==parsed.message)return fail(res,422,'Approved text does not match the exact text to be spoken.','message_not_approved');
  if(parsed.clinicalTerms.length&&!b.acknowledge_clinical_review)return res.status(422).json({ok:false,code:'clinical_content_review_required',error:'Potentially clinical wording requires review and explicit acknowledgement.',terms:parsed.clinicalTerms});
  if(!LANGUAGES[b.language])return fail(res,422,'Choose English, Hindi or Marathi.','unsupported_language');
  const age=calculateAge(patient.date_of_birth);
  if(age===null)return fail(res,409,'A valid date of birth is required before calls can be considered.','date_of_birth_required');
  const consent=await latestConsent(db,patient.id,phone.e164);
  if(!consent||consent.consent_status!=='granted')return fail(res,403,'Explicit automated-call consent for this saved phone number is required.','consent_required');
  if(consent.opted_out)return fail(res,403,'This recipient has opted out. Automated calls are blocked.','opted_out');
  if(consent.wrong_number)return fail(res,403,'This number was reported as incorrect and is blocked.','wrong_number');
  if(age<18&&!consent.guardian_confirmed)return fail(res,403,'Verified parent or guardian contact is required for a minor.','guardian_confirmation_required');
  const config=createVoiceConfig();
  if(mode==='live'){
   if(!config.enabled)return fail(res,403,'Live calls are disabled. No telephone call was placed.','live_calls_disabled');
   if(config.missingSettings.length)return res.status(503).json({ok:false,code:'voice_not_configured',error:'Sarvam Voice Agents is not fully configured.',missing_settings:config.missingSettings});
   const window=evaluateCallingWindow(new Date(),config.holidays);
   if(!window.allowed)return res.status(403).json({ok:false,code:'outside_calling_window',error:window.reason+'. No call was placed.',ist:window});
  }
  const idempotencyKey=String(req.headers['idempotency-key']||'').trim();
  if(!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey))return fail(res,400,'A valid idempotency key is required.','idempotency_key_required');
  const {data:existing}=await db.from('voice_agent_calls').select('*').eq('idempotency_key',idempotencyKey).maybeSingle();
  if(existing)return res.status(200).json({ok:true,duplicate:true,call:publicCall(existing)});
  if(mode==='live'){
   const {data:recent,error}=await db.from('voice_agent_calls').select('id,status').eq('clinic_id',patient.clinic_id).eq('patient_id',patient.id).eq('mode','live').gte('created_at',new Date(Date.now()-7*86400000).toISOString()).limit(5);
   if(error)return fail(res,400,error.message);
   if((recent||[]).length)return fail(res,409,'A live call was already attempted for this patient in the last seven days.','weekly_call_limit');
  }
  const row={clinic_id:patient.clinic_id,patient_id:patient.id,created_by:user.id,mode,status:mode==='simulated'?'simulated':'pending',language:b.language,phone_e164:phone.e164,recipient_name:patient.full_name,clinic_name:patient.clinic_name,message:parsed.message,message_sha256:sha256(parsed.message),appointment_datetime:String(b.appointment_datetime||'').slice(0,80)||null,clinic_contact_number:process.env.DEFAULT_CLINIC_CONTACT_NUMBER||null,consent_snapshot:{source:consent.consent_source,recorded_at:consent.consent_recorded_at,guardian_confirmed:consent.guardian_confirmed},warnings:parsed.clinicalTerms.length?['Potentially clinical words were reviewed and acknowledged by staff.']:[],idempotency_key:idempotencyKey};
  const {data:created,error:createError}=await db.from('voice_agent_calls').insert(row).select().single();
  if(createError){
   if(createError.code==='23505'){const {data:duplicate}=await db.from('voice_agent_calls').select('*').eq('idempotency_key',idempotencyKey).maybeSingle();if(duplicate)return res.status(200).json({ok:true,duplicate:true,call:publicCall(duplicate)});}
   if(createError.code==='23505')return fail(res,409,'A live call is already pending or in progress for this patient.','live_call_already_active');
   return fail(res,400,createError.message);
  }
  if(mode==='simulated'){
   const result={callDisposition:'unknown',messageDelivered:false,identityVerified:false,recipientResponse:'no_response',appointmentChanged:false,simulation:true,note:'Simulation only. No telephone call was placed and no message was delivered.'};
   const {data:updated}=await db.from('voice_agent_calls').update({result,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',created.id).select().single();
   return res.status(201).json({ok:true,call:publicCall(updated||{...created,result})});
  }
  try{
   // Recheck consent and state after insert so a concurrent revoke can block a not-yet-dispatched call.
   const currentConsent=await latestConsent(db,patient.id,phone.e164);
   const {data:currentCall,error:stateError}=await db.from('voice_agent_calls').select('status').eq('id',created.id).maybeSingle();
   if(stateError)throw stateError;
   if(!currentCall||currentCall.status!=='pending'||!currentConsent||currentConsent.consent_status!=='granted'||currentConsent.opted_out||currentConsent.wrong_number){
    await db.from('voice_agent_calls').update({status:'blocked',updated_at:new Date().toISOString()}).eq('id',created.id).eq('status','pending');
    return fail(res,403,'Consent was revoked or the call was blocked before dispatch. No call was placed.','consent_changed_before_dispatch');
   }
   const call={id:created.id,phone:created.phone_e164,recipientName:created.recipient_name,clinicName:created.clinic_name,message:created.message,language:created.language,appointmentDatetime:created.appointment_datetime,clinicContactNumber:created.clinic_contact_number};
   const attemptId=await createSarvamInstantOutbound(call,config);
   const {data:updated,error:updateError}=await db.from('voice_agent_calls').update({attempt_id:attemptId,status:'initiating',updated_at:new Date().toISOString()}).eq('id',created.id).select().single();
   if(updateError)throw updateError;
   return res.status(201).json({ok:true,call:publicCall(updated)});
  }catch(error){
   const result={callDisposition:'failed',messageDelivered:false,identityVerified:false,appointmentChanged:false,failureReason:String(error.message||'Sarvam dispatch failed.').slice(0,300)};
   await db.from('voice_agent_calls').update({status:'failed',result,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',created.id);
   return fail(res,error.status||502,error.message||'Sarvam could not place the call.','dispatch_failed');
  }
 }catch(error){return fail(res,error.status||500,error.message||'Unexpected voice-agent error.');}
}
