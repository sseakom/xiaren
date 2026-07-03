export function trimText(value?: string) {
  return (value || '').trim();
}

export function requireTrimmedText(
  value: string | undefined,
  errorMessage: string,
) {
  const trimmed = trimText(value);
  if (!trimmed) {
    throw new Error(errorMessage);
  }
  return trimmed;
}

export function normalizeOptionalNote(note?: string) {
  return trimText(note).slice(0, 200);
}
