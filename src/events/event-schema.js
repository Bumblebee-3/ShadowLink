const { z } = require('zod');

const eventTypes = ['message', 'email', 'navigation', 'file', 'authentication', 'qr'];
const entityInputSchema = z.record(z.unknown()).superRefine((entity, context) => {
  if (typeof entity.type !== 'string' || !entity.type.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Entity type is required' });
  }
  const value = entity.value || entity.normalized_value;
  if (value === undefined || value === null || !String(value).trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Entity value is required' });
  }
});

const eventInputSchema = z.object({
  source: z.string().trim().min(1).max(100),
  surface: z.string().trim().min(1).max(100).optional(),
  source_instance: z.string().trim().min(1).max(200).optional(),
  external_id: z.string().trim().min(1).max(500).optional(),
  type: z.enum(eventTypes),
  occurred_at: z.string().datetime({ offset: true }),
  actor: z.record(z.unknown()).optional(),
  target: z.record(z.unknown()).optional(),
  content: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  entities: z.array(entityInputSchema).optional(),
  data: z.record(z.unknown()).default({})
}).superRefine((value, context) => {
  if (Boolean(value.source_instance) !== Boolean(value.external_id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'source_instance and external_id must be provided together'
    });
  }
});

module.exports = { eventInputSchema, eventTypes };