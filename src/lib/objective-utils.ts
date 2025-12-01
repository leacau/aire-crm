import { format } from 'date-fns';
import { User } from './types';

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function getObjectiveForDate(
  user: Pick<User, 'monthlyObjective' | 'monthlyObjectives'> | null | undefined,
  targetDate: Date
): { value: number; sourceMonth: string | null } {
  if (!user) {
    return { value: 0, sourceMonth: null };
  }

  const objectives = user.monthlyObjectives ?? {};
  const targetKey = monthKey(targetDate);

  if (objectives[targetKey] !== undefined) {
    return { value: objectives[targetKey] ?? 0, sourceMonth: targetKey };
  }

  const sortedKeys = Object.keys(objectives).sort((a, b) => b.localeCompare(a));
  const fallbackKey = sortedKeys.find((key) => key <= targetKey && objectives[key] !== undefined) ?? null;

  if (fallbackKey) {
    return { value: objectives[fallbackKey] ?? 0, sourceMonth: fallbackKey };
  }

  return { value: user.monthlyObjective ?? 0, sourceMonth: null };
}
