import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVoiceConfig, normalizePhone, maskPhone, validateMessage,
  calculateAge, evaluateCallingWindow, buildInstantOutboundRequest,
  deriveOutcome, hmac, safeEqual, publicCall,
} from '../src/server/voice-agent/runtime.js';

const providerConfig = {
  publicBaseUrl: 'https://continuum.example',
  webhookSecret: 'a-long-test-webhook-secret',
  contextStrategy: 'agent_variables',
  sarvam: {
    appId: 'app-test', appVersion: 3, connectionId: 'connection-test',
    agentPhoneNumber: '+911234567890',
  },
};

test('live calls are disabled by default and configuration never reveals secret values', () => {
  const config = createVoiceConfig({VOICE_AGENT_WEBHOOK_SECRET:'test-secret'});
  assert.equal(config.enabled, false);
  assert.ok(config.missingSettings.includes('SARVAM_VOICE_API_KEY'));
  assert.ok(config.missingSettings.includes('SARVAM_APP_ID'));
  assert.ok(!JSON.stringify(config.missingSettings).includes('test-secret'));
});

test('legacy campaign webhook secret cannot configure the instant voice webhook', () => {
  const config = createVoiceConfig({VOICE_WEBHOOK_SECRET:'legacy-secret'});
  assert.ok(config.missingSettings.includes('VOICE_AGENT_WEBHOOK_SECRET'));
});

test('Indian saved mobile numbers normalize to E.164', () => {
  assert.deepEqual(normalizePhone('9876543210'), {ok:true,e164:'+919876543210'});
  assert.deepEqual(normalizePhone('+91 98765 43210'), {ok:true,e164:'+919876543210'});
  assert.equal(normalizePhone('12345').ok,false);
  assert.equal(maskPhone('+919876543210'),'+91 •••••• 10');
});

test('message validation blocks links and markdown and flags clinical words', () => {
  assert.equal(validateMessage('Your appointment is confirmed for tomorrow.').ok,true);
  assert.equal(validateMessage('Visit https://example.com for details.').code,'message_not_speakable');
  assert.equal(validateMessage('Please read **this** note carefully.').code,'message_not_speakable');
  const flagged=validateMessage('Please discuss your blood pressure report with the clinic.');
  assert.equal(flagged.ok,true);
  assert.ok(flagged.clinicalTerms.includes('blood pressure'));
  assert.equal(validateMessage('short').code,'message_too_short');
});

test('age is calculated in India local date and invalid birth dates are refused', () => {
  assert.equal(calculateAge('2005-12-07',new Date('2026-12-06T17:59:00.000Z')),20);
  assert.equal(calculateAge('2005-12-07',new Date('2026-12-06T18:00:00.000Z')),21);
  assert.equal(calculateAge('not-a-date'),null);
});

test('calling window enforces 09:00–20:00 IST, Monday–Saturday and configured holidays', () => {
  assert.equal(evaluateCallingWindow(new Date('2026-11-09T04:00:00.000Z')).allowed,true);
  assert.equal(evaluateCallingWindow(new Date('2026-11-09T15:00:00.000Z')).allowed,false);
  assert.equal(evaluateCallingWindow(new Date('2026-11-08T04:00:00.000Z')).allowed,false);
  assert.equal(evaluateCallingWindow(new Date('2026-11-09T04:00:00.000Z'),['2026-11-09']).allowed,false);
});

test('instant outbound body uses documented agent_variables and exact approved message', () => {
  const call={id:'call_test',phone:'+919876543210',recipientName:'Test Patient',clinicName:'Test Clinic',message:'Your appointment is confirmed for Monday at ten.',language:'mr-IN'};
  const body=buildInstantOutboundRequest({call,config:providerConfig});
  assert.equal(body.app_config.agent_variables.message_to_read,call.message);
  assert.equal(body.app_config.agent_variables.call_reference,call.id);
  assert.equal(body.app_config.app_overrides.initial_language_name,'Marathi');
  assert.equal(body.user_config.user_phone_number,call.phone);
  assert.match(body.webhook_config.url,/api\/voice-agent\/webhook/);
  assert.equal(body.webhook_config.metadata.call_id,call.id);
});

test('on-start strategy does not send app variables in the instant request body', () => {
  const body=buildInstantOutboundRequest({call:{id:'c',phone:'+919876543210',recipientName:'P',clinicName:'C',message:'An appointment reminder message.',language:'en-IN'},config:{...providerConfig,contextStrategy:'on_start_hook'}});
  assert.equal('agent_variables' in body.app_config,false);
});

test('HMAC comparison accepts correct token and rejects altered token', () => {
  const token=hmac('secret','call-1');
  assert.equal(safeEqual(token,hmac('secret','call-1')),true);
  assert.equal(safeEqual(token,hmac('secret','call-2')),false);
});

test('delivery cannot be reported until identity was verified', () => {
  const result=deriveOutcome({payload:{status:'connected',final_agent_variables:{message_delivered:true,identity_verified:false,call_disposition:'message_delivered',recipient_response:'confirmed'}}});
  assert.equal(result.messageDelivered,false);
  assert.equal(result.appointmentChanged,false);
});

test('opt-out and wrong-number are hard overrides even if agent variables say delivered', () => {
  const opted=deriveOutcome({payload:{status:'connected',final_agent_variables:{message_delivered:true,identity_verified:true,opt_out:true,call_disposition:'message_delivered'}}});
  assert.equal(opted.callDisposition,'opted_out');
  assert.equal(opted.messageDelivered,false);
  const wrong=deriveOutcome({payload:{status:'connected',final_agent_variables:{message_delivered:true,identity_verified:true,wrong_number:true,call_disposition:'message_delivered'}}});
  assert.equal(wrong.callDisposition,'wrong_person');
  assert.equal(wrong.messageDelivered,false);
});

test('a non-connected call cannot be marked as delivered', () => {
  const result=deriveOutcome({payload:{status:'no_answer',duration:15,final_agent_variables:{message_delivered:true,identity_verified:true}}});
  assert.equal(result.status,'no_answer');
  assert.equal(result.messageDelivered,false);
});

test('public call view masks the saved number', () => {
  const result=publicCall({id:'c',mode:'live',status:'initiating',recipient_name:'Patient',phone_e164:'+919876543210',language:'en-IN',message:'Reminder message',created_at:'2026-11-07T12:00:00Z'});
  assert.equal(result.phoneMasked,'+91 •••••• 10');
  assert.equal('phone' in result,false);
});
