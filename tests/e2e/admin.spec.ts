import { expect, test, type Page } from '@playwright/test';

const bike = { id: 'bike-1', model: 'Rockrider E-ST', type: 'mtb', status: 'available', voice_code: 'm1' };

async function authenticate(page: Page) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'user-1', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.signature`;
  await page.addInitScript(({ token }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: token,
      refresh_token: 'e2e-refresh-token',
      expires_at: 4102444800,
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com' },
    }));
  }, { token: accessToken });
}

test('задачу можно создать, завершить и удалить, а страницу велосипеда открыть', async ({ page }) => {
  await authenticate(page);
  let tasks: Array<Record<string, unknown>> = [];

  await page.route('**/rest/v1/bikes**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([bike]) }));
  await page.route('**/rest/v1/tenants**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/bike_tasks**', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      const input = route.request().postDataJSON();
      tasks = [{ ...input, id: 'task-1', source: 'site', bike }];
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    if (method === 'PATCH') {
      const input = route.request().postDataJSON();
      tasks = input.deleted_at ? [] : tasks.map((task) => ({ ...task, ...input }));
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tasks) });
  });

  await page.goto('./tasks');
  await expect(page.getByRole('heading', { name: 'Задачи' })).toBeVisible();
  await page.getByRole('button', { name: 'Новая задача' }).click();
  await page.getByLabel('Название').fill('Заменить колодки');
  await page.getByLabel('Описание').fill('Переднее колесо');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Заменить колодки' })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Завершить задачу: Заменить колодки' }).click();
  await expect(page.getByRole('checkbox', { name: 'Открыть задачу: Заменить колодки' })).toBeChecked();

  await page.getByRole('button', { name: 'Удалить задачу: Заменить колодки' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByText('Задач пока нет')).toBeVisible();

  await page.goto('./bike/bike-1');
  await expect(page.getByRole('heading', { name: 'Rockrider E-ST' })).toBeVisible();
  await expect(page.getByText('m1')).toBeVisible();
});

test('арендатора можно создать с велосипедом, отредактировать и записать оплату с корректировкой', async ({ page }) => {
  await authenticate(page);
  const rpcCalls: Array<{ name: string; body: Record<string, unknown> }> = [];
  const adjustments: Array<Record<string, unknown>> = [];
  const tenant = {
    id: 'tenant-1',
    name: 'Иван Тестовый',
    slug: 'ivan-test',
    bike_id: 'bike-1',
    bikes: bike,
    weekly_payment: 300,
    payment_day: 1,
    next_payment_date: '2026-07-27',
    next_payment_amount: 300,
    deposit: 500,
    is_archived: false,
    payments: [],
    payment_terms: [],
    payment_charges: [{
      id: 'charge-1',
      due_date: '2026-07-27',
      period_start: '2026-07-21',
      period_end: '2026-07-27',
      amount: 350,
      status: 'open',
      is_automatic: true,
    }],
    payment_adjustments: [],
  };

  await page.route('**/rest/v1/bikes**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([bike]) }));
  await page.route('**/rest/v1/tenants**', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const isDetail = new URL(route.request().url()).searchParams.has('id');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isDetail ? tenant : []) });
  });
  await page.route('**/rest/v1/tenant_payment_adjustments**', async (route) => {
    if (route.request().method() === 'POST') adjustments.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() || '';
    rpcCalls.push({ name, body: route.request().postDataJSON() });
    const body = name === 'create_tenant_with_rental'
      ? '"tenant-1"'
      : name === 'get_dashboard_snapshot'
        ? JSON.stringify({ tenants: [], bikes: [bike] })
        : 'null';
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Активные' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Показывать архивных' }).click();
  await expect(page.getByRole('button', { name: 'Показывать архивных' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Активные' }).click();
  await page.getByRole('button', { name: /Добавить/ }).click();
  await page.getByLabel('Имя арендатора').fill('Иван Тестовый');
  await page.getByLabel('Псевдоним ссылки').fill('ivan-test');
  await page.getByRole('button', { name: 'Велосипед', exact: true }).click();
  await page.getByRole('option', { name: /Rockrider E-ST/ }).click();
  await page.getByLabel('Еженедельный платеж (zł)').fill('300');
  await page.getByLabel('Депозит (zł)').fill('500');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect.poll(() => rpcCalls.find((call) => call.name === 'create_tenant_with_rental')?.body.p_bike_id).toBe('bike-1');

  await page.goto('./tenant/tenant-1');
  await expect(page.getByRole('heading', { name: 'Иван Тестовый' })).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать арендатора' }).click();
  await page.getByRole('button', { name: 'Велосипед', exact: true }).click();
  await page.getByRole('option', { name: 'Нет велосипеда' }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('dialog')).toContainText('Изменить велосипед?');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect.poll(() => rpcCalls.find((call) => call.name === 'update_tenant_profile')?.body.p_bike_id).toBeNull();

  await page.getByRole('button', { name: 'Добавить или изменить баланс' }).click();
  await page.getByRole('menuitem', { name: 'Добавить запись' }).click();
  await page.getByLabel('Сумма (zł)').fill('300');
  await page.getByLabel('Комментарий').fill('Оплата за неделю');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(() => rpcCalls.find((call) => call.name === 'record_tenant_payment')?.body.p_amount).toBe(300);

  await page.getByRole('button', { name: 'Добавить или изменить баланс' }).click();
  await page.getByRole('menuitem', { name: 'Добавить запись' }).click();
  await page.getByLabel('Тип записи').selectOption('adjustment');
  await page.getByLabel('Сумма (zł)').fill('50');
  await page.getByLabel('Причина корректировки').fill('Компенсация ремонта');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(() => adjustments[0]?.amount).toBe(50);

  await page.getByRole('button', { name: 'Добавить или изменить баланс' }).click();
  await page.getByRole('menuitem', { name: 'Добавить запись' }).click();
  await page.getByLabel('Тип записи').selectOption('charge');
  await page.getByLabel('Сумма (zł)').fill('120');
  await page.getByLabel('Период с').fill('2026-07-21');
  await page.getByLabel('Период по').fill('2026-07-24');
  await page.getByLabel('Комментарий').fill('Четыре дня аренды');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(() => rpcCalls.find((call) => call.name === 'save_tenant_charge')?.body).toMatchObject({
    p_amount: 120,
    p_period_start: '2026-07-21',
    p_period_end: '2026-07-24',
  });
});

test('основные страницы админки не переполняют экран шириной 320px', async ({ page }) => {
  await authenticate(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route('**/rest/v1/rpc/get_dashboard_snapshot', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ tenants: [], bikes: [{ id: 'bike-1', status: 'available' }] }),
  }));
  await page.route('**/rest/v1/bikes**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([bike]),
  }));
  for (const route of ['./', './bikes']) {
    await page.goto(route);
    await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('отмена подтверждения заявки не создаёт платёж', async ({ page }) => {
  await authenticate(page);
  const approvals: Array<Record<string, unknown>> = [];

  await page.route('**/rest/v1/payment_requests**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 'request-1', tenant_id: 'tenant-1', amount: 300, payment_method: 'cash', status: 'pending',
      requested_at: '2026-09-20T09:00:00Z', tenant: { name: 'Иван Тестовый' },
    }]),
  }));
  await page.route('**/rest/v1/tenants**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'approve_payment_request') approvals.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await page.goto('./payments/today');
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Подтвердить получение оплаты' })).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect(approvals).toHaveLength(0);

  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить оплату' }).click();
  await expect.poll(() => approvals).toHaveLength(1);
  expect(approvals[0]).toMatchObject({ p_request_id: 'request-1', p_payment_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
});

test('английский интерфейс не показывает русских подписей в основных разделах', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('language', 'en'));
  await authenticate(page);
  await page.route('**/rest/v1/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));

  for (const path of ['./', './bikes', './tasks', './payments']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect.poll(async () => {
      const text = await page.locator('main').innerText();
      return text.match(/.{0,60}[А-Яа-яЁё].{0,60}/)?.[0] ?? '';
    }, { message: path }).toBe('');
  }
});
