const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hour12: false,
});

export function istParts(date) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: parts.weekday,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function isWithinIstCallingWindow(date, start = '09:00', end = '20:00', holidays = []) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(start)) ||
      !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(end))) return false;
  const p = istParts(date);
  const minuteOfDay = p.hour * 60 + p.minute;
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
  const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
  return p.weekday !== 'Sun' &&
    !holidays.includes(p.dateKey) &&
    minuteOfDay >= Math.max(9 * 60, startMinutes) &&
    minuteOfDay < Math.min(20 * 60, endMinutes) &&
    startMinutes < endMinutes;
}

export function nextAllowedIstCallingTime(after, start = '09:00', end = '18:00', holidays = []) {
  const base = after instanceof Date ? after : new Date(after);
  if (Number.isNaN(base.getTime())) throw new Error('A valid current time is required.');
  // Search minute-by-minute for at most three days. The dispatch batch is small
  // and this avoids hand-written UTC offset arithmetic around IST boundaries.
  const candidate = new Date(Math.ceil(base.getTime() / 60000) * 60000);
  for (let i = 0; i < 3 * 24 * 60; i += 1) {
    if (isWithinIstCallingWindow(candidate, start, end, holidays)) return candidate;
    candidate.setTime(candidate.getTime() + 60000);
  }
  throw new Error('No permitted calling window was found in the next 72 hours.');
}
