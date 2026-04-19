// Helpers for writing audit_log entries without spilling PII into
// append-only history. Visitor form responses (names, emails, phones) flow
// through several mutation bodies; persisting them in `diff.after` means the
// PII survives /redact-pii, which only scrubs the current visit row.

type FormResponseCarrier = Partial<Record<'formResponse' | 'form_response', unknown>>;

/**
 * Return a shallow copy of `body` with any form-response field removed.
 * Every other field is preserved so the audit trail retains the decision
 * inputs (location, schedule, party size if on the envelope, etc.).
 */
export function redactAuditBody<T extends FormResponseCarrier>(
  body: T,
): Omit<T, 'formResponse' | 'form_response'> {
  const { formResponse: _fr, form_response: _fr2, ...rest } = body;
  return rest;
}
