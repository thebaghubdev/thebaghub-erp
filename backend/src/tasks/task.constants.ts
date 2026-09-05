export const TASK_SEVERITIES = [
  'critical',
  'high',
  'moderate',
  'low',
] as const;
export type TaskSeverity = (typeof TASK_SEVERITIES)[number];

export const TASK_PROGRESS = [
  'pending',
  'in_progress',
  'completed',
] as const;
export type TaskProgress = (typeof TASK_PROGRESS)[number];

export const TASK_SEVERITY_LABELS: Record<TaskSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

export const SYSTEM_TASK_CREATOR_NAME = 'System';

/** Titles used by `TasksService.createAssigned` (system-generated assignment tasks). */
export function isSystemGeneratedTaskTitle(title: string): boolean {
  const t = title.trim();
  return (
    /^Verify payment for Order #\d+$/u.test(t) ||
    /^Verify reservation payment for Order #\d+$/u.test(t) ||
    /^Verify pullout fee for Inquiry .+$/u.test(t) ||
    /^Verify authentication fee for Inquiry .+$/u.test(t) ||
    /^Verify walk-in authentication payment for .+$/u.test(t) ||
    /^Verify 3rd-party authentication payment for .+$/u.test(t) ||
    /^Order #\d+ is assigned to you$/u.test(t) ||
    /^Order #\d+ is Paid$/u.test(t) ||
    /^Item .+ is assigned to you for authentication$/u.test(t) ||
    /^Item .+ is ready for editing$/u.test(t)
  );
}

export function isSystemCreatedTask(task: {
  createdById: string | null;
  title: string;
}): boolean {
  return task.createdById == null || isSystemGeneratedTaskTitle(task.title);
}
