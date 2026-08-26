import { describe, expect, it } from 'vitest';
import { googlePayload, normalizeVoiceCode, parseGoogleTask } from './googleTasks';

const bikes = [
  { id: 'mtb-id', model: 'Rockrider', voice_code: 'm12' },
  { id: 'fat-id', model: 'Big Foot', voice_code: 'f3' },
];

describe('Google Tasks transformations', () => {
  it.each([
    ['Проверить m 12', 'm12'],
    ['замена для F-003', 'f3'],
    ['без кода', null],
  ])('normalizes voice codes in %s', (value, expected) => {
    expect(normalizeVoiceCode(value)).toBe(expected);
  });

  it('imports bike, priority, date and removes sync metadata', () => {
    expect(parseGoogleTask({
      id: 'google-1',
      title: '[m12] Заменить колодки',
      notes: 'Переднее колесо\nPriority: high\nSite task: old-id',
      due: '2026-08-05T00:00:00.000Z',
      status: 'needsAction',
    }, bikes)).toMatchObject({
      bike_id: 'mtb-id',
      title: 'Заменить колодки',
      description: 'Переднее колесо',
      priority: 'high',
      due_date: '2026-08-05',
      status: 'open',
    });
  });

  it('preserves an in-progress state when Google task is still open', () => {
    expect(parseGoogleTask({ id: 'google-2', title: 'Big Foot диагностика' }, bikes, {
      bike_id: 'fat-id',
      priority: 'low',
      status: 'in_progress',
    })).toMatchObject({ bike_id: 'fat-id', priority: 'low', status: 'in_progress' });
  });

  it('exports stable metadata and completion state', () => {
    expect(googlePayload({
      id: 'site-1',
      title: 'Смазать цепь',
      description: 'После мойки',
      status: 'done',
      priority: 'normal',
      due_date: '2026-08-01',
      bike: bikes[1],
    })).toEqual({
      title: '[f3] Смазать цепь',
      notes: 'После мойки\n\nBike: f3\nPriority: normal\nSite task: site-1',
      status: 'completed',
      due: '2026-08-01T00:00:00.000Z',
    });
  });
});
