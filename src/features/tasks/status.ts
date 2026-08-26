import type { BikeTaskPriority, BikeTaskStatus } from '../../types';

export const BIKE_TASK_STATUS_LABELS: Record<BikeTaskStatus, string> = {
    open: 'Открыта',
    in_progress: 'В работе',
    done: 'Готова'
};

export const BIKE_TASK_PRIORITY_LABELS: Record<BikeTaskPriority, string> = {
    low: 'Низкий',
    normal: 'Обычный',
    high: 'Высокий'
};
