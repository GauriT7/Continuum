import crypto from 'node:crypto';

export const LANGUAGES = Object.freeze({
  'en-IN': { code: 'en-IN', label: 'English (India)', sarvamName: 'English' },
  'hi-IN': { code: 'hi-IN', label: 'Hindi', sarvamName: 'Hindi' },
  'mr-IN': { code: 'mr-IN', label: 'Marathi', sarvamName: 'Marathi' },
});
export const DISPOSITIONS = Object.freeze([
  'message_delivered','callback_requested','reschedule_requested','wrong_person','opted_out',
  'no_answer','busy','failed','incomplete','unknown','emergency_redirected','clinical_query_redirected',
]);
export const WEBHOOK_STATUSES = Object.freeze(['connected','no_answer','busy','failed']);

const CLINICAL_TERMS = [
  'diagnosis','diagnosed','dosage','dose','mg','ml','tablet','medicine','medication',
  'prescription','antibiotic','injection','test result','test report','report is','scan report',
  'ultrasound finding','haemoglobin','hemoglobin','blood pressure','blood sugar','sugar level',
  'symptom','bleeding','fever','pain','infection','complication','abortion','miscarriage','hiv','positive result',
];
const TRUEISH = new Set(['true','yes','y','1','confirmed']);
const bool = value => typeof value === 'boolean' ? value : typeof value === 'string' && TRUEISH.has(value.trim().toLowerCase());

export function createVoiceConfig(env = process.env) {
  const version = Number.parseInt(env.SARVAM_APP_VERSION || '0', 10);
  let publicBaseUrl = String(env.PUBLIC_BASE_URL || '').trim().replace(/\\/+$/, '');
  if (!publicBaseUrl && env.VERCEL_PROJECT_PRODUCTION_URL) publicBaseUrl = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (!publicBaseUrl && env.VERCEL_URL) publicBaseUrl = `https://${env.VERCEL_URL}`;
  const contextStrategy = env.SARVAM_CONTEXT_STRATEGY === 'on_start_hook' ? 'on_start_hook' : 'agent_variables';
  const config = {
    enabled: String(env.VOICE_INSTANT_CALLS_ENABLED || '').toLowerCase() === 'true',
    webhookSecret: env.VOICE_AGENT_WEBHOOK_SECRET || '',
    contextHookSecret: env.VOICE_CONTEXT_HOOK_SECRET || '',
    publicBaseUrl,
    contextStrategy,
    sarvam: {
      apiKey: env.SARVAM_VOICE_API_KEY || '',
      orgId: env.SARVAM_ORG_ID || '',
      workspaceId: env.SARVAM_WORKSPACE_ID || '',
      appId: env.SARVAM_APP_ID || '',
      appVersion: Number.isInteger(version) && version > 0 ? version : 0,
      connectionId: env.SARVAM_CONNECTION_ID || '',
      agentPhoneNumber: env.SARVAM_AGENT_PHONE_NUMBER || '',
      apiBaseUrl: (env.SARVAM_API_BASE_URL || 'https://apps.sarvam.ai/api/outbounds/v1').replace(/\\/+$/, ''),
      timeoutMs: Math.min(30000, Math.max(5000, Number.parseInt(env.SARVAM_TIMEOUT_MS || '15000', 10) || 15000)),
    },
    clinicName: env.CLINIC_NAME || 'Continuum Partner Clinic',
    clinicContactNumber: env.DEFAULT_CLINIC_CONTACT_NUMBER || '',
    holidays: String(env.CALLING_HOLIDAYS || '').split(',').map(x=>x.trim()).filter(x=>/^\\d{4}-\\d{2}-\\d{2}$/.test(x)),
    maxMessageLength: 800,
  };
  const required = [
    ['SARVAM_VOICE_API_KEY',config.sarvam.apiKey],['SARVAM_ORG_ID',config.sarvam.orgId],
    ['SARVAM_WORKSPACE_ID',config.sarvam.workspaceId],['SARVAM_APP_ID',config.sarvam.appId],
    ['SARVAM_APP_VERSION',config.sarvam.appVersion],['SARVAM_CONNECTION_ID',config.sarvam.connectionId],
    ['SARVAM_AGENT_PHONE_NUMBER',config.sarvam.agentPhoneNumber],
    ['VOICE_AGENT_WEBHOOK_SECRET',config.webhookSecret],['PUBLIC_BASE_URL',config.publicBaseUrl],
  ];
  config.missingSettings = required.filter(([,value])=>!value).map(([name])=>name);
  if (contextStrategy === 'on_start_hook' && !config.contextHookSecret) config.missingSettings.push('VOICE_CONTEXT_HOOK_SECRET');
  return config;
}

export function normalizePhone(input) {
  if (typeof input !== 'string' || !input.trim()) return {ok:false,error:'The patient record has no phone number.'};
  let value = input.trim().replace(/[\\s()\\-.]/g,'');
  if (value.startsWith('00')) value = '+' + value.slice(2);
  if (/^[6-9]\\d{9}$/.test(value)) value = '+91' + value;
  if (/^91[6-9]\\d{9}$/.test(value)) value = '+' + value;
  if (!/^\\+[1-9]\\d{7,14}$/.test(value)) return {ok:false,error:'The saved patient phone must be a valid international E.164 number.'};
  return {ok:true,e164:value};
}
export function maskPhone(value) {
  if (typeof value !== 'string' || !/^\\+[1-9]\\d{7,14}$/.test(value)) return '••••';
  return value.slice(0,3) + ' •••••• ' + value.slice(-2);
}
export function hmac(secret, value) {
  return crypto.createHmac('sha256',secret).update(String(value),'utf8').digest('hex');
}
export function safeEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string') return false;
  const x=Buffer.from(a,'utf8'),y=Buffer.from(b,'utf8');
  if(x.length!==y.length){crypto.timingSafeEqual(x,x);return false;}
  return crypto.timingSafeEqual(x,y);
}
export function sha256(value) {
  return crypto.createHash('sha256').update(String(value),'utf8').digest('hex');
}
export function validateMessage(value) {
  if(typeof value!=='string'||!value.trim()) return {ok:false,code:'missing_message',error:'A message to be spoken is required.'};
  const message=value.replace(/\\r\\n/g,'\\n').trim();
  if(message.length<12) return {ok:false,code:'message_too_short',error:'The message is too short to be a complete administrative message.'};
  if(message.length>800) return {ok:false,code:'message_too_long',error:'The message exceeds the 800-character calling limit.'};
  const issues=[];
  if(/https?:\\/\\//i.test(message)) issues.push('url');
  if(/<[^>]+>/.test(message)) issues.push('html');
  if(/\\*\\*|__|#{2,}/.test(message)) issues.push('markdown');
  if(issues.length) return {ok:false,code:'message_not_speakable',error:'Remove links, markup and Markdown before approving a spoken message.',issues};
  const lower=message.toLowerCase();
  const terms=CLINICAL_TERMS.filter(term=>(term.length<=3?new RegExp('\\\\b'+term+'\\\\b','i'):lower.includes(term)));
  return {ok:true,message,clinicalTerms:[...new Set(terms)]};
}
export function calculateAge(dobValue, now = new Date()) {
  const m=/^(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(dobValue||''));
  if(!m) return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  const age=Number(parts.year)-Number(m[1])-((Number(parts.month)<Number(m[2])||(Number(parts.month)===Number(m[2])&&Number(parts.day)<Number(m[3])))?1:0);
  return age>=0?age:null;
}
export function evaluateCallingWindow(date, holidays = []) {
  const parts={};
  for(const p of new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hour12:false}).formatToParts(date)) parts[p.type]=p.value;
  const hour=Number(parts.hour)%24;
  const dateKey=`${parts.year}-${parts.month}-${parts.day}`;
  const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  if(holidays.includes(dateKey)) return {allowed:false,reason:'Configured public/clinic holiday',date:dateKey,time:parts.hour+':'+parts.minute};
  if(weekday===0) return {allowed:false,reason:'Sunday is not a calling day',date:dateKey,time:parts.hour+':'+parts.minute};
  if(hour<9||hour>=20) return {allowed:false,reason:'Calls are allowed only between 09:00 and 20:00 IST',date:dateKey,time:parts.hour+':'+parts.minute};
  return {allowed:true,date:dateKey,time:parts.hour+':'+parts.minute};
}
export function buildInstantOutboundRequest({call,config}) {
  const language=LANGUAGES[call.language]||LANGUAGES['en-IN'];
  const appVariables={
    message_to_read:call.message,recipient_name:call.recipientName,clinic_name:call.clinicName,
    language:call.language,call_reference:call.id,
  };
  if(call.appointmentDatetime) appVariables.appointment_datetime=call.appointmentDatetime;
  if(call.clinicContactNumber) appVariables.clinic_contact_number=call.clinicContactNumber;
  const body={
    app_config:{
      app_id:config.sarvam.appId,app_version:config.sarvam.appVersion,
      connection_config:{connection_id:config.sarvam.connectionId,agent_phone_number:config.sarvam.agentPhoneNumber},
      app_type:'agent',app_overrides:{initial_language_name:language.sarvamName},
    },
    user_config:{user_phone_number:call.phone},
    webhook_config:{
      url:`${config.publicBaseUrl}/api/voice-agent/webhook/${config.webhookSecret}`,
      metadata:{call_id:call.id,token:hmac(config.webhookSecret,call.id),source:'continuum-voice-agent'},
    },
  };
  if(config.contextStrategy!=='on_start_hook') body.app_config.agent_variables=appVariables;
  return body;
}
export async function createSarvamInstantOutbound(call,config) {
  const s=config.sarvam;
  const url=`${s.apiBaseUrl}/orgs/${encodeURIComponent(s.orgId)}/workspaces/${encodeURIComponent(s.workspaceId)}/outbounds`;
  let response;
  try {
    response=await fetch(url,{
      method:'POST',headers:{'X-API-Key':s.apiKey,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(buildInstantOutboundRequest({call,config})),
      signal:AbortSignal.timeout(s.timeoutMs),
    });
  } catch(error) {
    throw Object.assign(new Error('Sarvam could not be reached. No call was confirmed.'),{status:502,code:'sarvam_unreachable'});
  }
  const text=await response.text();
  let payload=null;try{payload=text?JSON.parse(text):null}catch{}
  if(!response.ok) throw Object.assign(new Error(`Sarvam rejected the call request (HTTP ${response.status}).`),{status:502,code:'sarvam_rejected'});
  if(typeof payload?.attempt_id!=='string'||!payload.attempt_id) throw Object.assign(new Error('Sarvam returned no attempt identifier. Check the Voice Agents dashboard before retrying.'),{status:502,code:'sarvam_unexpected_response'});
  return payload.attempt_id;
}
export function deriveOutcome({payload}) {
  const raw=payload?.final_agent_variables||{};
  const recipientResponse=String(raw.recipient_response||'unclear').toLowerCase();
  const allowedResponses=new Set(['confirmed','repeated_and_confirmed','cannot_attend','callback_requested','wrong_person','opted_out','clinical_question_redirected','emergency_reported','unclear','no_response']);
  let response=allowedResponses.has(recipientResponse)?recipientResponse:'unclear';
  const identityVerified=bool(raw.identity_verified);
  const wrongNumber=bool(raw.wrong_number)||response==='wrong_person';
  const optOut=bool(raw.opt_out)||response==='opted_out';
  const callbackRequested=bool(raw.callback_requested)||response==='callback_requested';
  const rescheduleRequested=bool(raw.reschedule_requested)||response==='cannot_attend';
  const rawDisposition=String(raw.call_disposition||'unknown').toLowerCase();
  const dispositionAliases={
    acknowledged:'message_delivered',
    repeat_requested:'incomplete',
    wrong_number:'wrong_person',
    opt_out:'opted_out',
    identity_not_verified:'incomplete',
    no_response:'no_answer',
    ended_early:'incomplete',
  };
  let disposition=dispositionAliases[rawDisposition]||rawDisposition;
  const emergencyRedirected=disposition==='emergency_redirected'||response==='emergency_reported';
  const clinicalRedirected=disposition==='clinical_query_redirected'||response==='clinical_question_redirected';
  if(emergencyRedirected) response='emergency_reported';
  else if(clinicalRedirected) response='clinical_question_redirected';
  if(!DISPOSITIONS.includes(disposition)) disposition='unknown';
  if(wrongNumber) disposition='wrong_person';
  else if(optOut) disposition='opted_out';
  else if(rescheduleRequested) disposition='reschedule_requested';
  else if(callbackRequested) disposition='callback_requested';
  const messageDelivered=payload.status==='connected'&&bool(raw.message_delivered)&&identityVerified&&!wrongNumber&&!optOut&&!emergencyRedirected&&!clinicalRedirected;
  const transcript=Array.isArray(payload.interaction_transcript)?payload.interaction_transcript.filter(t=>t&&(t.role==='agent'||t.role==='user')&&typeof t.en_text==='string').slice(0,60).map(t=>({role:t.role,text:String(t.en_text).slice(0,1200)})):null;
  const vars={};
  for(const key of ['identity_verified','call_disposition','recipient_response','callback_requested','reschedule_requested','opt_out','wrong_number','message_delivered']){
    if(raw[key]!==undefined&&raw[key]!==null) vars[key]=String(raw[key]).slice(0,120);
  }
  if(payload.status!=='connected'){
    return {status:payload.status==='no_answer'?'no_answer':payload.status==='busy'?'busy':'failed',callDisposition:payload.status==='no_answer'?'no_answer':payload.status==='busy'?'busy':'failed',messageDelivered:false,identityVerified:false,recipientResponse:'no_response',callbackRequested:false,rescheduleRequested:false,optOut:false,wrongNumber:false,appointmentChanged:false,durationSeconds:Number(payload.duration)||null,transcript:null,agentVariables:null,failureReason:String(payload.failure_reason||'').slice(0,300)||null};
  }
  return {
    status:'completed',callDisposition:disposition,messageDelivered,identityVerified,recipientResponse:response,
    callbackRequested,rescheduleRequested,optOut,wrongNumber,
    appointmentChanged:false,durationSeconds:Number(payload.duration)||null,transcript,agentVariables:Object.keys(vars).length?vars:null,
    failureReason:null,
  };
}
export function publicCallView(row) {
  return {
    id:row.id,mode:row.mode,status:row.status,recipientName:row.recipient_name,
    phoneMasked:maskPhone(row.phone_e164),language:row.language,message:row.message,
    clinicName:row.clinic_name,appointmentDatetime:row.appointment_datetime||null,
    createdAt:row.created_at,updatedAt:row.updated_at,completedAt:row.completed_at||null,
    result:row.result||null,attemptId:row.sarvam_attempt_id||null,
    warnings:row.warnings||[],timeline:row.events||[],
  };
}
