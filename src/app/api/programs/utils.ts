import { serializeDocument } from '@/lib/server/firestore';
import type { Program } from '@/lib/types';

export function mapProgram(id: string, data: FirebaseFirestore.DocumentData | undefined): Program {
  const program = serializeDocument<Program>(id, data);

  if (!program.schedules) {
    return {
      ...program,
      schedules: [{
        id: 'default',
        daysOfWeek: program.daysOfWeek || [],
        startTime: program.startTime || '',
        endTime: program.endTime || '',
      }],
    };
  }

  return program;
}

export function stripLegacyScheduleFields<T extends Partial<Program>>(programData: T): Partial<Program> {
  const dataToSave = { ...programData };
  delete dataToSave.startTime;
  delete dataToSave.endTime;
  delete dataToSave.daysOfWeek;
  return dataToSave;
}
