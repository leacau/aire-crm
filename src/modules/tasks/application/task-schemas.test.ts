import { describe, expect, it } from 'vitest';

import { rescheduleTaskSchema } from './task-schemas';

describe('rescheduleTaskSchema', () => {
  it('accepts ISO date strings', () => {
    expect(() => rescheduleTaskSchema.parse({ dueDate: '2026-06-25T15:00:00.000Z' })).not.toThrow();
  });

  it('rejects invalid dates', () => {
    expect(() => rescheduleTaskSchema.parse({ dueDate: 'mañana' })).toThrow();
  });
});
