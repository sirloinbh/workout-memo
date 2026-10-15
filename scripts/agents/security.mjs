// Apply at structured persistence and presentation boundaries as well as pipe logs.
export function redact(value, secret = process.env.TEST_DATABASE_URL) {
  if (!secret) return value;
  if (typeof value === 'string') return value.replaceAll(secret, '[REDACTED_TEST_DATABASE_URL]');
  if (Array.isArray(value)) return value.map((item) => redact(item, secret));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [redact(key, secret), redact(item, secret)]),
    );
  return value;
}

export const sensitivePath = (name) =>
  /(^|\/)(\.env(?:\..*)?|\.git|\.aws|\.codex|backups|credentials?)(\/|$)|\.tfstate(?:\.|$)|\.tfplan$|(^|\/)(connection\.json|container\.env)$/i.test(
    name.replaceAll('\\', '/'),
  );

export function publicationPaths(names) {
  for (const name of names) {
    if (sensitivePath(name)) throw new Error(`Sensitive path cannot be published: ${name}`);
  }
  return names;
}
