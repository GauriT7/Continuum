import { getSupabaseForRequest } from './supabase.js';
import { createClient } from '@supabase/supabase-js';
export const fail=(res,status,error,code)=>res.status(status).json({ok:false,error,code});
export const bodyOf=req=>typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
export function adminDb(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Voice Agent requires Supabase service-role configuration on the server.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function requireVoiceStaff(req){
 const {supabase,token}=getSupabaseForRequest(req),{data:auth,error:authError}=await supabase.auth.getUser(token);
 if(authError||!auth?.user)throw Object.assign(new Error('Please sign in again.'),{status:401});
 const {data:members,error}=await supabase.from('clinic_members').select('clinic_id,role').eq('user_id',auth.user.id).limit(10);
 if(error)throw Object.assign(new Error(error.message),{status:400});
 if(!members?.length)throw Object.assign(new Error('Your account is not linked to a clinic.'),{status:403});
 return {user:auth.user,clinicIds:members.map(m=>m.clinic_id),members,db:adminDb()};
}
export async function getPatientForStaff(db,id,clinicIds){
 if(!id)throw Object.assign(new Error('Choose a patient.'),{status:400});
 const {data,error}=await db.from('patients').select('id,clinic_id,full_name,phone,date_of_birth').eq('id',id).in('clinic_id',clinicIds).maybeSingle();
 if(error)throw Object.assign(new Error(error.message),{status:400});
 if(!data)throw Object.assign(new Error('Patient is not in your clinic.'),{status:403});
 const {data:clinic}=await db.from('clinics').select('id,name').eq('id',data.clinic_id).maybeSingle();
 return {...data,clinic_name:clinic?.name||process.env.CLINIC_NAME||'Continuum Partner Clinic'};
}
export async function latestConsent(db,patientId,phone){
 let query=db.from('voice_agent_consents').select('*').eq('patient_id',patientId).order('created_at',{ascending:false}).limit(1);
 if(phone)query=query.eq('phone_e164',phone);
 const {data,error}=await query.maybeSingle();
 if(error)throw Object.assign(new Error(error.message),{status:400});
 return data||null;
}
export function publicCall(row){
 const phone=row.phone_e164||'';
 return {id:row.id,mode:row.mode,status:row.status,recipientName:row.recipient_name,phoneMasked:phone?phone.slice(0,3)+' •••••• '+phone.slice(-2):'••••',language:row.language,message:row.message,clinicName:row.clinic_name,appointmentDatetime:row.appointment_datetime||null,createdAt:row.created_at,updatedAt:row.updated_at,completedAt:row.completed_at||null,attemptId:row.attempt_id||null,providerStatus:row.provider_status||null,warnings:row.warnings||[],result:row.result||null};
}
