import {requireVoiceStaff,fail} from '../../../../api/_lib/voice-agent.js';
import {createVoiceConfig} from '../runtime.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return fail(res,405,'Method not allowed.');
 try{await requireVoiceStaff(req);const c=createVoiceConfig();return res.status(200).json({ok:true,provider:'sarvam_voice_agents',enabled:c.enabled,configured:c.missingSettings.length===0,ready:c.enabled&&c.missingSettings.length===0,missingSettings:c.missingSettings,deploymentVerified:c.deploymentVerified,connectionVerified:c.connectionVerified,webhookPath:'/api/voice-agent/webhook/{VOICE_AGENT_WEBHOOK_SECRET}',contextStrategy:c.contextStrategy,callingWindow:{timezone:'Asia/Kolkata',start:'09:00',end:'20:00',days:'Monday–Saturday',holidays:c.holidays}});}
 catch(e){return fail(res,e.status||500,e.message||'Configuration error.');}
}
