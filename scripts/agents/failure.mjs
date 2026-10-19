export function commandFailureKind(error) {
  return /\b(?:EACCES|EPERM|ENOENT|ENOSPC|EMFILE|ENFILE)\b|access is denied|permission denied|operation not permitted/i.test(
    `${error.code || ''} ${error.message || ''}`,
  )
    ? 'environment'
    : undefined;
}
