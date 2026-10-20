const string = { type: 'string' };
const strings = { type: 'array', items: string };
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

// Uses the existing role/model invocation; no extra model call for notifications.
export const agentResultSchema = object({
  blocked: { type: 'boolean' },
  approved: { type: 'boolean' },
  summary: string,
  decisionRequest: {
    anyOf: [
      { type: 'null' },
      object({
        id: string,
        issue: { type: 'integer' },
        requirementsVersion: string,
        question: string,
        options: {
          type: 'array',
          items: object({ id: string, label: string, pros: strings, cons: strings }),
        },
        recommendation: object({ optionId: string, reason: string }),
        impact: string,
        dependsOn: strings,
      }),
    ],
  },
});
