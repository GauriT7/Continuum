import { getSupabaseForRequest } from './_lib/supabase.js'

const fail=(res,status,error)=>res.status(status).json({ok:false,error})
const bodyOf=req=>typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})
const allowedLanguages=new Set(['en-IN','hi-IN','mr-IN'])
const allowedPurposes=new Set(['appointment_confirmation','documents_pending','reschedule_request','postpartum_followup','callback_request'])

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  try{
    const {supabase,token}=getSupabaseForRequest(req)
    const {data:auth,error:authError}=await supabase.auth.getUser(token)
    if(authError||!auth?.user)return fail(res,401,'Please sign in again.')
    const {data:members,error:memberError}=await supabase.from('clinic_members').select('clinic_id,role').eq('user_id',auth.user.id).limit(10)
    if(memberError)return fail(res,400,memberError.message)
    if(!members?.length)return fail(res,403,'Your account is not linked to a clinic.')
    const clinicIds=members.map(x=>x.clinic_id)
    if(req.method==='GET'){
      const [patients,prefs,calls]=await Promise.all([
        supabase.from('patients').select('id,clinic_id,full_name,phone,date_of_birth').in('clinic_id',clinicIds).order('created_at',{ascending:false}).limit(process.env.CONTINUUM_DEMO_MODE==='true'?3:300),
        supabase.from('voice_contact_preferences').select('*').in('clinic_id',clinicIds).limit(300),
        supabase.from('voice_calls').select('id,clinic_id,patient_id,purpose,scheduled_at,language_code,status,dispatched_at,completed_at,call_duration,call_outcome,callback_requested,failure_reason').in('clinic_id',clinicIds).order('scheduled_at',{ascending:false}).limit(100)
      ])
      const bad=[patients,prefs,calls].find(x=>x.error)
      if(bad)return fail(res,400,bad.error.message)
      return res.status(200).json({ok:true,patients:patients.data,preferences:prefs.data,calls:calls.data})
    }
    const b=bodyOf(req)
    if(req.method==='POST'&&b.action==='preference'){
      if(!b.patient_id||!/^\+[1-9]\d{7,14}$/.test(String(b.phone_e164||'')))return fail(res,400,'Choose a patient and enter a valid international phone number.')
      if(!allowedLanguages.has(b.language_code))return fail(res,400,'Choose a supported language.')
      if(!['not_recorded','granted','revoked'].includes(b.consent_status))return fail(res,400,'Record consent status.')
      if(b.consent_status==='granted'&&!b.consent_confirmed)return fail(res,400,'Confirm that the patient explicitly consented to automated calls.')
      const safeStart=String(b.safe_start_time||'09:00'),safeEnd=String(b.safe_end_time||'18:00')
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(safeStart)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(safeEnd)||safeStart<'09:00'||safeEnd>'20:00'||safeStart>=safeEnd)return fail(res,400,'Calling times must be a valid window within 09:00–20:00 IST.')
      if(b.consent_status==='granted'&&typeof b.contact_is_parent_guardian!=='boolean')return fail(res,400,'Confirm whether this number belongs to the patient or, for a minor, the parent/guardian.')
      const {data:patient,error:pe}=await supabase.from('patients').select('id,clinic_id,date_of_birth').eq('id',b.patient_id).single()
      if(pe||!clinicIds.includes(patient?.clinic_id))return fail(res,403,'Patient is not in your clinic.')
      const {data,error}=await supabase.from('voice_contact_preferences').upsert({
        clinic_id:patient.clinic_id,patient_id:patient.id,phone_e164:b.phone_e164,language_code:b.language_code,
        consent_status:b.consent_status,consent_at:b.consent_status==='granted'?new Date().toISOString():null,
        consent_recorded_by:auth.user.id,safe_start_time:b.safe_start_time||'09:00',
        safe_end_time:safeEnd,contact_is_parent_guardian:b.contact_is_parent_guardian===true,timezone:'Asia/Kolkata',updated_at:new Date().toISOString()
      },{onConflict:'patient_id'}).select().single()
      if(error)return fail(res,400,error.message)
      if(b.consent_status!=='granted'){
        await supabase.from('voice_calls').update({status:'blocked',failure_reason:'Patient calling consent is not active.',updated_at:new Date().toISOString()})
          .eq('patient_id',patient.id).eq('status','scheduled')
      }
      return res.status(200).json({ok:true,preference:data})
    }
    if(req.method==='POST'&&b.action==='schedule'){
      if(!b.patient_id||!allowedPurposes.has(b.purpose))return fail(res,400,'Choose a patient and one of the five approved administrative call purposes.')
      if(!String(b.clinic_callback_sla||'').trim())return fail(res,400,'Enter the clinic-approved callback service level.')
      if(['appointment_confirmation','reschedule_request','postpartum_followup'].includes(b.purpose)&&!String(b.appointment_datetime||'').trim())return fail(res,400,'Appointment date and time are required for this call purpose.')
      if(b.purpose==='documents_pending'&&!String(b.callback_instruction||'').trim())return fail(res,400,'Enter the clinic-approved pending document instructions.')
      const scheduled=new Date(b.scheduled_at)
      if(!b.scheduled_at||Number.isNaN(scheduled.getTime())||scheduled<=new Date())return fail(res,400,'Choose a future call date and time.')
      const {data:patient,error:pe}=await supabase.from('patients').select('id,clinic_id,date_of_birth').eq('id',b.patient_id).single()
      if(pe||!clinicIds.includes(patient?.clinic_id))return fail(res,403,'Patient is not in your clinic.')
      const {data:pref,error:fe}=await supabase.from('voice_contact_preferences').select('consent_status,language_code,contact_is_parent_guardian').eq('patient_id',b.patient_id).single()
      if(fe||!pref||pref.consent_status!=='granted')return fail(res,403,'Valid patient consent is required before scheduling a call.')
      const dob=patient?.date_of_birth?new Date(patient.date_of_birth):null
      if(!dob||Number.isNaN(dob.getTime()))return fail(res,409,'The clinic record needs a verified date of birth before the agent can establish adult or minor status.')
      const today=new Date(),age=today.getFullYear()-dob.getFullYear()-(today.getMonth()<dob.getMonth()||(today.getMonth()===dob.getMonth()&&today.getDate()<dob.getDate())?1:0)
      if(age<18&&pref.contact_is_parent_guardian!==true)return fail(res,403,'For a minor, confirm that the calling number belongs to the parent or guardian before scheduling.')
      const {data,error}=await supabase.from('voice_calls').insert({
        clinic_id:patient.clinic_id,patient_id:patient.id,purpose:b.purpose,scheduled_at:scheduled.toISOString(),
        language_code:pref.language_code,context:{
          appointment_datetime:String(b.appointment_datetime||'').slice(0,60),
          callback_instruction:String(b.callback_instruction||'').slice(0,200),
          clinic_callback_sla:String(b.clinic_callback_sla).trim().slice(0,120)
        },consent_snapshot:true,status:'scheduled',created_by:auth.user.id
      }).select().single()
      if(error)return fail(res,400,error.message)
      return res.status(201).json({ok:true,call:data})
    }
    if(req.method==='PATCH'&&b.action==='cancel'){
      const {data,error}=await supabase.from('voice_calls').update({status:'cancelled',updated_at:new Date().toISOString()})
        .eq('id',b.id).in('clinic_id',clinicIds).eq('status','scheduled').select().maybeSingle()
      if(error)return fail(res,400,error.message)
      if(!data)return fail(res,409,'This call is already dispatching or is no longer cancellable.')
      return res.status(200).json({ok:true,call:data})
    }
    return fail(res,400,'Unknown voice action.')
  }catch(e){return fail(res,e.status||500,e.message||'Unexpected voice error.')}
}
