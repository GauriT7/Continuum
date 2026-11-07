import {requireVoiceStaff,fail,publicCall} from '../../../../api/_lib/voice-agent.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return fail(res,405,'Method not allowed.');
 try{const {clinicIds,db}=await requireVoiceStaff(req);const {data,error}=await db.from('voice_agent_calls').select('*').eq('id',String(req.query?.id||'')).in('clinic_id',clinicIds).maybeSingle();if(error)return fail(res,400,error.message);if(!data)return fail(res,404,'Call record not found.');return res.status(200).json({ok:true,call:publicCall(data)});}
 catch(e){return fail(res,e.status||500,e.message||'Call lookup failed.');}
}
