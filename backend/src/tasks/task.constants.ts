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
