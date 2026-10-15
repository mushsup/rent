import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

import { createTenant, deleteTenantRecord, saveAdjustment, saveCharge, savePayment, updateTenantProfile } from './api';
import type { TenantEditForm } from '../../types';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  // Chainable: every .eq() returns another .eq() plus a clean error,
  // mirroring the supabase query builder used by the api module.
  mocks.eq.mockReturnValue({ eq: mocks.eq, error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.delete.mockReturnValue({ eq: mocks.eq });
  mocks.select.mockResolvedValue({ data: [], error: null });
  mocks.from.mockReturnValue({ update: mocks.update, select: mocks.select, insert: mocks.insert, delete: mocks.delete });
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

  it('scopes payment deletes to the owning tenant', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: null });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    mocks.from.mockReturnValueOnce({ delete: vi.fn().mockReturnValue({ eq: firstEq }) });

    await deleteTenantRecord({ type: 'payment', id: 'payment-1' }, 'tenant-1');

    expect(mocks.from).toHaveBeenCalledWith('payments');
    expect(firstEq).toHaveBeenCalledWith('id', 'payment-1');
    expect(secondEq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });

  it('inserts a new adjustment with the tenant attached', async () => {
    await saveAdjustment('tenant-1', null, {
      direction: 'charge',
      amount: 50,
      balance_override: null,
      adjustment_date: '2026-07-27',
      comment: '',
    });

    expect(mocks.from).toHaveBeenCalledWith('tenant_payment_adjustments');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 'tenant-1',
      amount: 50,
    }));
  });

  it('updates an existing adjustment by id', async () => {
    await saveAdjustment('tenant-1', { id: 'adj-1' } as never, {
      direction: 'credit',
      amount: 20,
      balance_override: null,
      adjustment_date: '2026-07-27',
      comment: 'Скидка',
    });

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ amount: 20 }));
    expect(mocks.eq).toHaveBeenCalledWith('id', 'adj-1');
  });

  it('rejects adjustment edits without an id', async () => {
    await expect(saveAdjustment('tenant-1', {} as never, {
      direction: 'charge',
      amount: 20,
      balance_override: null,
      adjustment_date: '2026-07-27',
      comment: '',
    })).rejects.toThrow('Adjustment id is required');
  });

  it('scopes payment edits to the owning tenant', async () => {
    await savePayment('tenant-1', { id: 'payment-1' } as never, 300, '2026-07-27', '');

    expect(mocks.from).toHaveBeenCalledWith('payments');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ amount: 300 }));
    expect(mocks.eq).toHaveBeenCalledWith('id', 'payment-1');
    expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });

  it('de-duplicates slugs against existing tenants', async () => {
    mocks.select.mockResolvedValueOnce({ data: [{ slug: 'ivan' }, { slug: 'ivan-2' }], error: null });

    await createTenant({
      name: 'Иван',
      slug: 'Ivan',
      bike_id: 'bike-1',
      weekly_payment: '300',
      payment_day: '1',
      next_payment_date: '2026-07-27',
      deposit: '0',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('create_tenant_with_rental', expect.objectContaining({
      p_slug: 'ivan-3',
    }));
  });

});
