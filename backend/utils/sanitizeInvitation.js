export function sanitizeInvitationText(value, maxLength = 5000) {
  return String(value ?? '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeInvitationSubject(value) {
  return sanitizeInvitationText(value, 200);
}
