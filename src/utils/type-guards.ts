export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

export function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
