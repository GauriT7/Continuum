import { createVoiceConfig, safeEqual } from '../runtime.js';
import { adminDb, fail } from '../../../../api/_lib/voice-agent.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return fail(res,405,'Method not allowed.');
  const config=createVoiceConfig();
  const supplied=String(req.headers['x-continuum-hook-secret']||'');
  if(!config.contextHookSecret||!safeEqual(supplied,config.contextHookSecret))return fail(res,401,'Agent context hook authentication failed.');
  try{
    const id=String(req.query?.id||'');
    const db=adminDb();
    const {data:call,error}=await db.from('voice_agent_calls').select('id,message,recipient_name,clinic_name,language,appointment_datetime,clinic_contact_number,status').eq('id',id).maybeSingle();
    if(error)return fail(res,500,'Could not load call context.');
    if(!call||['completed','no_answer','busy','failed','blocked'].includes(call.status))return fail(res,404,'Call context is unavailable.');
    const variables={message_to_read:call.message,recipient_name:call.recipient_name,clinic_name:call.clinic_name,language:call.language};
    if(call.appointment_datetime)variables.appointment_datetime=call.appointment_datetime;
    if(call.clinic_contact_number)variables.clinic_contact_number=call.clinic_contact_number;
    return res.status(200).json({variables});
  }catch(error){return fail(res,500,error.message||'Agent context hook failed.');}
}
