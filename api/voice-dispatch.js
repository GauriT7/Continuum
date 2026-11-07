import { createClient } from '@supabase/supabase-js'
const fail=(res,status,error)=>res.status(status).json({ok:false,error})
const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const languageName=code=>({'en-IN':'English','hi-IN':'Hindi','mr-IN':'Marathi','ta-IN':'Tamil','te-IN':'Telugu','kn-IN':'Kannada','gu-IN':'Gujarati','bn-IN':'Bengali','pa-IN':'Punjabi','ml-IN':'Malayalam','or-IN':'Odia'})[code]||'English'

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return fail(res,405,'Method not allowed.')
  if(!process.env.CRON_SECRET||(req.headers.authorization||'')!==`Bearer ${process.env.CRON_SECRET}`)return fail(res,401,'Unauthorized cron request.')
  const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SARVAM_VOICE_API_KEY','SARVAM_ORG_ID','SARVAM_WORKSPACE_ID','SARVAM_CAMPAIGN_ID']
  const missing=required.filter(k=>!process.env[k])
  if(missing.length)return fail(res,503,`Missing environment variables: ${missing.join(', ')}`)
  const supabase=db()
  const {data:claimed,error}=await supabase.rpc('claim_due_voice_calls',{p_limit:20})
  if(error)return fail(res,500,error.message)
  if(!claimed?.length)return res.status(200).json({ok:true,claimed:0,dispatched:0})
  const patientIds=[...new Set(claimed.map(x=>x.patient_id))]
  const clinicIds=[...new Set(claimed.map(x=>x.clinic_id))]
  const [pr,vr,cr]=await Promise.all([
    supabase.from('patients').select('id,full_name').in('id',patientIds),
    supabase.from('voice_contact_preferences').select('patient_id,phone_e164,language_code,consent_status').in('patient_id',patientIds),
    supabase.from('clinics').select('id,name').in('id',clinicIds)
  ])
  if(pr.error||vr.error||cr.error){
    await supabase.from('voice_calls').update({status:'dispatch_failed',failure_reason:'Could not load approved call context.'}).in('id',claimed.map(x=>x.id))
    return fail(res,500,'Could not load call context.')
  }
  const patients=new Map(pr.data.map(x=>[x.id,x])),prefs=new Map(vr.data.map(x=>[x.patient_id,x])),clinics=new Map(cr.data.map(x=>[x.id,x]))
  const users=[],blocked=[]
  for(const c of claimed){
    const p=patients.get(c.patient_id),v=prefs.get(c.patient_id)
    if(!p||!v||v.consent_status!=='granted'||!v.phone_e164){blocked.push(c.id);continue}
    users.push({
      user_phone_number:v.phone_e164,
      user_identifier:c.id,
      app_variables:{
        continuum_call_id:c.id,patient_name:p.full_name,
        clinic_name:clinics.get(c.clinic_id)?.name||'the clinic',
        call_purpose:c.purpose.replaceAll('_',' '),
        appointment_datetime:c.context?.appointment_datetime||'',
        callback_instruction:'Capture callback requests for clinic staff. Do not provide medical advice.'
      },
      app_overrides:{initial_language_name:languageName(c.language_code||v.language_code)}
    })
  }
  if(blocked.length)await supabase.from('voice_calls').update({status:'blocked',failure_reason:'Consent or phone preference missing.'}).in('id',blocked)
  if(!users.length)return res.status(200).json({ok:true,claimed:claimed.length,dispatched:0,blocked:blocked.length})
  const url=`https://apps.sarvam.ai/api/scheduling/v1/orgs/${encodeURIComponent(process.env.SARVAM_ORG_ID)}/workspaces/${encodeURIComponent(process.env.SARVAM_WORKSPACE_ID)}/campaigns/${encodeURIComponent(process.env.SARVAM_CAMPAIGN_ID)}/cohorts/stream`
  try{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':process.env.SARVAM_VOICE_API_KEY},body:JSON.stringify({name:`continuum-${Date.now()}`,users})})
    const result=await response.json()
    if(!response.ok)throw new Error(result?.detail||result?.message||`Sarvam returned ${response.status}`)
    const {error:updateError}=await supabase.from('voice_calls').update({status:'queued',sarvam_cohort_id:result.cohort_id,dispatched_at:new Date().toISOString(),updated_at:new Date().toISOString()}).in('id',users.map(u=>u.user_identifier))
    if(updateError)throw updateError
    return res.status(200).json({ok:true,claimed:claimed.length,dispatched:users.length,blocked:blocked.length,cohort_id:result.cohort_id,cohort_status:result.status})
  }catch(e){
    await supabase.from('voice_calls').update({status:'dispatch_failed',failure_reason:String(e.message).slice(0,500)}).in('id',users.map(u=>u.user_identifier))
    return fail(res,502,e.message||'Sarvam dispatch failed.')
  }
}
