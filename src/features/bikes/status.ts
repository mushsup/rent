import type { BikeStatus } from '../../types';

export const BIKE_STATUS_LABELS: Record<BikeStatus, string> = {
    available: 'Свободен',
    in_rent: 'В аренде',
    maintenance: 'Ремонт'
};

export function getBikeStatusLabel(status: BikeStatus | null | undefined): string {
    return status ? BIKE_STATUS_LABELS[status] : 'Статус неизвестен';
}
