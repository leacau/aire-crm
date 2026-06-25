import { describe, expect, it } from 'vitest';

import { createActivitySchema, rescheduleTaskSchema, updateActivitySchema } from './task-schemas';

describe('rescheduleTaskSchema', () => {
  it('accepts ISO date strings', () => {
    expect(() => rescheduleTaskSchema.parse({ dueDate: '2026-06-25T15:00:00.000Z' })).not.toThrow();
  });

  it('rejects invalid dates', () => {
    expect(() => rescheduleTaskSchema.parse({ dueDate: 'mañana' })).toThrow();
  });
});

describe('createActivitySchema', () => {
  it('accepts client activities', () => {
    const parsed = createActivitySchema.parse({
      clientId: 'client-1',
      type: 'Llamada',
      observation: 'Seguimiento',
      isTask: false,
    });

    expect(parsed.clientId).toBe('client-1');
  });

  it('requires an entity association', () => {
    expect(() => createActivitySchema.parse({
      type: 'Mail',
      observation: 'Sin entidad',
    })).toThrow();
  });

  it('requires dueDate when creating tasks', () => {
    expect(() => createActivitySchema.parse({
      clientId: 'client-1',
      type: 'WhatsApp',
      observation: 'Recordatorio',
      isTask: true,
    })).toThrow();
  });
});

describe('updateActivitySchema', () => {
  it('allows completing a task', () => {
    expect(updateActivitySchema.parse({ completed: true })).toEqual({ completed: true });
  });

  it('requires dueDate when converting an activity into a task', () => {
    expect(() => updateActivitySchema.parse({ isTask: true })).toThrow();
  });
});
