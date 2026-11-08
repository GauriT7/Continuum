import { createClient } from '@supabase/supabase-js'
import { getSarvamApiKey, getCampaignVoiceMissingSettings } from './_lib/sarvam-config.js'
import { isWithinIstCallingWindow, nextAllowedIstCallingTime } from './_lib/voice-safety.js'
const fail=(res,status,error)=>res.status(status).json({ok:false,error})
const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const languageName=code=>({'en-IN':'English','hi-IN':'Hindi','mr-IN':'Marathi'})[code]||'English'
const ageInYears=dobValue=>{
  const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(dobValue||''))
  if(!match)return null
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]))
  const year=Number(parts.year),month=Number(parts.month),day=Number(parts.day)
  const by=Number(match[1]),bm=Number(match[2]),bd=Number(match[3])
  return year-by-((month<bm||(month===bm&&day<bd))?1:0)
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return fail(res,405,'Method not allowed.')
  if(!process.env.CRON_SECRET||(req.headers.authorization||'')!==`Bearer ${process.env.CRON_SECRET}`)return fail(res,401,'Unauthorized cron request.')
  if(process.env.VOICE_DISPATCH_ENABLED!=='true')return res.status(200).json({ok:true,enabled:false,claimed:0,dispatched:0,message:'Voice dispatch is disabled until the prompt, campaign, Exotel connection, webhook, safe-call policy and test suite are signed off.'})
  const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']
  const missing=[...required.filter(k=>!process.env[k]),...getCampaignVoiceMissingSettings()]
  if(missing.length)return fail(res,503,`Missing environment variables: ${missing.join(', ')}`)
  const supabase=db()
  const {data:claimed,error}=await supabase.rpc('claim_due_voice_calls',{p_limit:20})
  if(error)return fail(res,500,error.message)
  if(!claimed?.length)return res.status(200).json({ok:true,claimed:0,dispatched:0})
  const patientIds=[...new Set(claimed.map(x=>x.patient_id))]
  const clinicIds=[...new Set(claimed.map(x=>x.clinic_id))]
  const [pr,vr,cr,ar]=await Promise.all([
    supabase.from('patients').select('id,full_name,date_of_birth').in('id',patientIds),
    supabase.from('voice_contact_preferences').select('patient_id,phone_e164,language_code,consent_status,contact_is_parent_guardian,safe_start_time,safe_end_time').in('patient_id',patientIds),
    supabase.from('clinics').select('id,name').in('id',clinicIds),
    supabase.from('voice_agent_consents').select('patient_id,phone_e164,consent_status,opted_out,wrong_number,created_at').in('patient_id',patientIds).order('created_at',{ascending:false})
  ])
  if(pr.error||vr.error||cr.error||ar.error){
    await supabase.from('voice_calls').update({status:'dispatch_failed',failure_reason:'Could not load approved call context.'}).in('id',claimed.map(x=>x.id))
    return fail(res,500,'Could not load call context.')
  }
  const patients=new Map(pr.data.map(x=>[x.id,x])),prefs=new Map(vr.data.map(x=>[x.patient_id,x])),clinics=new Map(cr.data.map(x=>[x.id,x]))
  const agentConsents=new Map()
  for(const consent of (ar.data||[])) {
    const key=consent.patient_id+'|'+consent.phone_e164
    if(!agentConsents.has(key))agentConsents.set(key,consent)
  }
  const users=[],blocked=[]
  let deferred=0
  const holidays=String(process.env.CALLING_HOLIDAYS||'').split(',').map(x=>x.trim()).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x))
  for(const c of claimed){
    const p=patients.get(c.patient_id),v=prefs.get(c.patient_id),clinic=clinics.get(c.clinic_id),context=c.context||{}
    const age=ageInYears(p?.date_of_birth)
    if(age===null){blocked.push(c.id);continue}
    const patientIsMinor=age<18
    const language=c.language_code||v?.language_code||'en-IN'
    const requiresAppointment=['appointment_confirmation','reschedule_request','postpartum_followup'].includes(c.purpose)
    const agentConsent=v?agentConsents.get(c.patient_id+'|'+v.phone_e164):null
    if(!p?.full_name||!v||v.consent_status!=='granted'||!v.phone_e164||
      !agentConsent||agentConsent.consent_status!=='granted'||agentConsent.opted_out||agentConsent.wrong_number||
      !clinic?.name||!['en-IN','hi-IN','mr-IN'].includes(language)||(patientIsMinor&&v.contact_is_parent_guardian!==true)||
      !context.clinic_callback_sla||(requiresAppointment&&!context.appointment_datetime)||
      (c.purpose==='documents_pending'&&!context.callback_instruction)){
      blocked.push(c.id);continue
    }
    if(!isWithinIstCallingWindow(new Date(),v.safe_start_time||'09:00',v.safe_end_time||'18:00',holidays)){
      const nextTime=nextAllowedIstCallingTime(new Date(),v.safe_start_time||'09:00',v.safe_end_time||'18:00',holidays)
      const {error:deferError}=await supabase.from('voice_calls').update({
        status:'scheduled',scheduled_at:nextTime.toISOString(),
        failure_reason:'Deferred to the next permitted recipient calling window.',
        updated_at:new Date().toISOString()
      }).eq('id',c.id).eq('status','dispatching')
      if(deferError){
        await supabase.from('voice_calls').update({
          status:'blocked',
          failure_reason:'Could not defer call to a permitted recipient calling window.',
          updated_at:new Date().toISOString()
        }).eq('id',c.id).eq('status','dispatching')
        blocked.push(c.id)
        continue
      }
      deferred+=1
      continue
    }
    users.push({
      user_phone_number:v.phone_e164,
      user_identifier:c.id,
      app_variables:{
        continuum_call_id:c.id,
        patient_name:p.full_name,
        clinic_name:clinic.name,
        call_purpose:c.purpose,
        appointment_datetime:context.appointment_datetime||'',
        callback_instruction:context.callback_instruction||'',
        preferred_language:language,
        patient_is_minor:patientIsMinor,
        clinic_callback_sla:context.clinic_callback_sla
      },
      app_overrides:{initial_language_name:languageName(language)}
    })
  }
  if(blocked.length)await supabase.from('voice_calls').update({status:'blocked',failure_reason:'Consent or phone preference missing.'}).in('id',blocked)
  if(!users.length)return res.status(200).json({ok:true,claimed:claimed.length,dispatched:0,blocked:blocked.length,deferred})
  const url=`https://apps.sarvam.ai/api/scheduling/v1/orgs/${encodeURIComponent(process.env.SARVAM_ORG_ID)}/workspaces/${encodeURIComponent(process.env.SARVAM_WORKSPACE_ID)}/campaigns/${encodeURIComponent(process.env.SARVAM_CAMPAIGN_ID)}/cohorts/stream`
  try{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':getSarvamApiKey()},body:JSON.stringify({name:`continuum-${Date.now()}`,users})})
    const result=await response.json()
    if(!response.ok)throw new Error(result?.detail||result?.message||`Sarvam returned ${response.status}`)
    const {error:updateError}=await supabase.from('voice_calls').update({status:'queued',sarvam_cohort_id:result.cohort_id,dispatched_at:new Date().toISOString(),updated_at:new Date().toISOString()}).in('id',users.map(u=>u.user_identifier))
    if(updateError)throw updateError
    return res.status(200).json({ok:true,claimed:claimed.length,dispatched:users.length,blocked:blocked.length,deferred,cohort_id:result.cohort_id,cohort_status:result.status})
  }catch(e){
    await supabase.from('voice_calls').update({status:'dispatch_failed',failure_reason:String(e.message).slice(0,500)}).in('id',users.map(u=>u.user_identifier))
    return fail(res,502,e.message||'Sarvam dispatch failed.')
  }
}
