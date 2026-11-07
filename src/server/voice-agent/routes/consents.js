import { requireVoiceStaff,fail,bodyOf,getPatientForStaff,latestConsent } from '../../../../api/_lib/voice-agent.js';
import { normalizePhone,calculateAge } from '../runtime.js';
const sources=new Set(['verbal_in_clinic','written_form','digital_form','phone_confirmation']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return fail(res,405,'Method not allowed.');
 try{
  const {user,clinicIds,db}=await requireVoiceStaff(req);
  if(req.method==='GET'){
   const p=await getPatientForStaff(db,String(req.query?.patient_id||''),clinicIds),phone=normalizePhone(p.phone);
   if(!phone.ok)return res.status(200).json({ok:true,consent:null,phone:null});
   const c=await latestConsent(db,p.id,phone.e164);
   return res.status(200).json({ok:true,phone:phone.e164,consent:c?{status:c.consent_status,source:c.consent_source,recordedAt:c.consent_recorded_at,optedOut:c.opted_out,wrongNumber:c.wrong_number,guardianConfirmed:c.guardian_confirmed}:null});
  }
  const b=bodyOf(req),p=await getPatientForStaff(db,b.patient_id,clinicIds),phone=normalizePhone(p.phone);
  if(!phone.ok)return fail(res,422,phone.error,'invalid_phone');
  const existing=await latestConsent(db,p.id,phone.e164);
  if(b.action==='revoke'){
   if(b.confirmed!==true)return fail(res,400,'Confirm consent revocation.','confirmation_required');
   if(!existing)return fail(res,404,'No consent record exists for the saved number.');
   const {error}=await db.from('voice_agent_consents').update({consent_status:'revoked',updated_at:new Date().toISOString()}).eq('id',existing.id);
   if(error)return fail(res,400,error.message);
   await db.from('voice_agent_calls').update({status:'blocked',updated_at:new Date().toISOString()}).eq('patient_id',p.id).eq('clinic_id',p.clinic_id).in('status',['pending','initiating']);
   return res.status(200).json({ok:true,consent:{status:'revoked'}});
  }
  if(b.confirmed!==true)return fail(res,400,'Confirm that explicit automated-call consent was obtained.','consent_confirmation_required');
  if(!sources.has(b.source))return fail(res,400,'Choose a valid consent source.','invalid_consent_source');
  const age=calculateAge(p.date_of_birth);
  if(age===null)return fail(res,409,'A valid date of birth is required before automated calling consent can be recorded.','date_of_birth_required');
  if(existing?.opted_out)return fail(res,403,'This recipient has opted out. Staff cannot override this preference.','opted_out');
  if(existing?.wrong_number)return fail(res,403,'This number is blocked because it was reported as incorrect. Update the patient record first.','wrong_number');
  if(age<18&&b.guardian_confirmed!==true)return fail(res,403,'Confirm the saved number belongs to the parent or legal guardian.','guardian_confirmation_required');
  const row={clinic_id:p.clinic_id,patient_id:p.id,phone_e164:phone.e164,consent_status:'granted',consent_source:b.source,consent_recorded_by:user.id,consent_recorded_at:new Date().toISOString(),guardian_confirmed:age<18,updated_at:new Date().toISOString()};
  const {data,error}=await db.from('voice_agent_consents').upsert(row,{onConflict:'patient_id,phone_e164'}).select().single();
  if(error)return fail(res,400,error.message);
  return res.status(201).json({ok:true,consent:{status:data.consent_status,source:data.consent_source,recordedAt:data.consent_recorded_at,guardianConfirmed:data.guardian_confirmed}});
 }catch(error){return fail(res,error.status||500,error.message||'Unexpected consent error.');}
}
