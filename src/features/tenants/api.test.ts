import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

import { createTenant, deleteTenantRecord, finishTenantRental, saveCharge, savePayment, updateTenantProfile } from './api';
import type { TenantEditForm } from '../../types';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.select.mockResolvedValue({ data: [], error: null });
  mocks.from.mockReturnValue({ update: mocks.update, select: mocks.select });
});

describe('atomic tenant workflows', () => {
  it('assigns a bike through the create_tenant_with_rental RPC', async () => {
    await createTenant({
      name: 'Иван',
      slug: 'Ivan Courier',
      bike_id: 'bike-1',
      weekly_payment: '300',
      payment_day: '1',
      next_payment_date: '2026-07-27',
      deposit: '500',
      telegram_username: '@ivan',
      battery_config: '48V',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('create_tenant_with_rental', expect.objectContaining({
      p_bike_id: 'bike-1',
      p_weekly_payment: 300,
      p_deposit: 500,
      p_slug: 'ivan-courier',
      p_telegram_username: 'ivan',
      p_battery_config: '48V',
    }));
  });

  it('releases a bike through update_tenant_profile instead of separate table writes', async () => {
    const form = {
      id: 'tenant-1',
      name: 'Иван',
      slug: 'ivan',
      bike_id: '',
      bikes: null,
      weekly_payment: 300,
      payment_day: 1,
      next_payment_date: null,
      deposit: 500,
      payments: [],
      payment_terms: [],
      payment_charges: [],
      payment_adjustments: [],
      rental_events: [],
    } as TenantEditForm;

    await updateTenantProfile('tenant-1', form);
    expect(mocks.rpc).toHaveBeenCalledWith('update_tenant_profile', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_bike_id: null,
      p_next_payment_date: null,
      p_phone: null,
      p_telegram_username: null,
      p_battery_config: null,
    }));
    expect(mocks.from).not.toHaveBeenCalledWith('tenants');
  });

  it('records a new payment through the atomic payment RPC', async () => {
    await savePayment('tenant-1', null, 300, '2026-07-27', 'Оплата');
    expect(mocks.rpc).toHaveBeenCalledWith('record_tenant_payment', {
      p_tenant_id: 'tenant-1',
      p_amount: 300,
      p_payment_date: '2026-07-27',
      p_comment: 'Оплата',
    });
  });

  it('edits the expected payment through its dedicated RPC', async () => {
    await savePayment('tenant-1', { isExpected: true }, 275, '2026-08-03', 'Скидка');
    expect(mocks.rpc).toHaveBeenCalledWith('update_tenant_expected_payment', {
      p_tenant_id: 'tenant-1',
      p_due_date: '2026-08-03',
      p_amount: 275,
      p_comment: 'Скидка',
    });
  });

  it('saves editable charge periods atomically', async () => {
    await saveCharge('tenant-1', { id: 'charge-1', amount: 300, due_date: '2026-07-27' }, {
      amount: 150,
      due_date: '2026-07-24',
      period_start: '2026-07-21',
      period_end: '2026-07-24',
      comment: '4 дня аренды',
      status: 'open',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('save_tenant_charge', expect.objectContaining({
      p_charge_id: 'charge-1',
      p_period_start: '2026-07-21',
      p_period_end: '2026-07-24',
      p_amount: 150,
    }));
  });

  it('deletes a charge through the schedule-aware RPC', async () => {
    await deleteTenantRecord({ type: 'charge', id: 'charge-1' }, 'tenant-1');
    expect(mocks.rpc).toHaveBeenCalledWith('delete_tenant_charge', {
      p_tenant_id: 'tenant-1',
      p_charge_id: 'charge-1',
    });
  });

  it('finishes a rental with the reviewed date, amount and reason', async () => {
    await finishTenantRental('tenant-1', '2026-07-24', 200, 'Велосипед возвращён');
    expect(mocks.rpc).toHaveBeenCalledWith('finish_tenant_rental', {
      p_tenant_id: 'tenant-1',
      p_end_date: '2026-07-24',
      p_final_amount: 200,
      p_reason: 'Велосипед возвращён',
    });
  });
});
