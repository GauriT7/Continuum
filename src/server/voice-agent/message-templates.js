/**
 * Draft, clinic-review-required spoken reminder templates.
 *
 * These are administrative reminders only, not clinical advice.
 * Do not send until a clinician/clinic administrator has reviewed the exact
 * rendered text and the recipient's preferred language.
 */
export const REMINDER_TEMPLATE_STATUS = 'draft-review-required';

export const REMINDER_TEMPLATES = Object.freeze({
  'en-IN': 'Namaste {{recipient_name}}. This is an appointment reminder from {{clinic_name}}. Your appointment is scheduled for {{appointment_datetime}}. If you need to contact the clinic, please call {{clinic_contact_number}}. This is an administrative reminder only.',
  'hi-IN': 'नमस्ते {{recipient_name}}। यह {{clinic_name}} की ओर से आपकी अपॉइंटमेंट का रिमाइंडर है। आपकी अपॉइंटमेंट {{appointment_datetime}} को तय है। क्लिनिक से संपर्क करने के लिए कृपया {{clinic_contact_number}} पर कॉल करें। यह केवल अपॉइंटमेंट से जुड़ी सूचना है।',
  'mr-IN': 'नमस्कार {{recipient_name}}। हा {{clinic_name}} कडून आपल्या अपॉइंटमेंटची आठवण करून देण्यासाठी केलेला संदेश आहे. आपली अपॉइंटमेंट {{appointment_datetime}} रोजी ठरलेली आहे. क्लिनिकशी संपर्क साधण्यासाठी कृपया {{clinic_contact_number}} या क्रमांकावर फोन करा. ही केवळ अपॉइंटमेंटसंबंधी सूचना आहे.',
});

export function renderReminderTemplate(language, values = {}) {
  const template = REMINDER_TEMPLATES[language];
  if (!template) throw new Error('Choose English, Hindi or Marathi.');
  const required = ['recipient_name', 'clinic_name', 'appointment_datetime', 'clinic_contact_number'];
  const missing = required.filter(key => !String(values[key] || '').trim());
  if (missing.length) throw new Error('Missing reminder fields: ' + missing.join(', '));
  const message = template.replace(/{{([a-z_]+)}}/g, (_, key) => String(values[key] ?? '').trim());
  return { language, message, status: REMINDER_TEMPLATE_STATUS, requiresHumanApproval: true };
}
