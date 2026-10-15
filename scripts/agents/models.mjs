// User-approved project routing. No model discovery or automatic fallback.
const assignments = Object.freeze({
  planning: ['gpt-6-astra', 'high'],
  debugging: ['gpt-6-astra', 'high'],
  highRiskReview: ['gpt-6-astra', 'high'],
  tests: ['gpt-6.1-sol', 'medium'],
  implementation: ['gpt-6.1-sol', 'medium'],
  review: ['gpt-6.1-sol', 'medium'],
  research: ['gpt-6-luna', 'medium'],
  documentation: ['gpt-6-luna', 'medium'],
});

export function modelSelection(role) {
  if (!Object.hasOwn(assignments, role)) throw new Error(`Unknown model role: ${role}`);
  const [model, reasoningEffort] = assignments[role];
  return { role, model, reasoningEffort };
}

export function validateRouting({ taskKind = 'code', reviewRole = 'review' } = {}) {
  if (!['code', 'documentation'].includes(taskKind)) throw new Error('Invalid task kind.');
  if (!['review', 'highRiskReview'].includes(reviewRole)) throw new Error('Invalid review role.');
  return { taskKind, reviewRole };
}

export function stageSelection(job, stage) {
  const { taskKind, reviewRole } = validateRouting(job);
  return modelSelection(
    stage === 'review'
      ? reviewRole
      : taskKind === 'documentation' && stage === 'implementation'
        ? 'documentation'
        : stage,
  );
}

export function modelArguments(selection) {
  return [
    '--model',
    selection.model,
    '-c',
    `model_reasoning_effort="${selection.reasoningEffort}"`,
  ];
}
