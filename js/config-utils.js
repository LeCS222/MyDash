export function isValidConfig(data) {
  return Boolean(data && typeof data === 'object' && Array.isArray(data.widgets));
}
