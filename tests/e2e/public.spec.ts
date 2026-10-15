import { expect, test } from '@playwright/test';

test('корень без сессии показывает форму входа в светлой и тёмной теме', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      localStorage.setItem('theme', value);
      document.documentElement.classList.toggle('dark', value === 'dark');
    }, theme);
    await page.screenshot({ path: testInfo.outputPath(`login-${theme}.png`), fullPage: true });
  }
});

test('ошибка авторизации показывается доступным текстом', async ({ page }) => {
  await page.route('**/auth/v1/token**', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Invalid login credentials' }),
  }));
  await page.goto('./');
  await page.getByPlaceholder('Email адрес').fill('wrong@example.com');
  await page.getByPlaceholder('Пароль').fill('wrong-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
});

test('публичная страница арендатора показывает данные и платежный статус', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_public_tenant_profile', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'tenant-1',
      name: 'Тестовый арендатор',
      slug: 'test-tenant',
      weekly_payment: 300,
      next_payment_date: '2099-08-03',
      next_payment_amount: 300,
      payments: [],
      payment_terms: [],
      payment_charges: [],
      payment_adjustments: [],
      bikes: { id: 'bike-1', model: 'Rockrider' },
    }),
  }));
  await page.goto('./test-tenant');
  await expect(page.getByRole('heading', { name: 'Тестовый арендатор' })).toBeVisible();
  await expect(page.getByText('Rockrider')).toBeVisible();
  await expect(page.getByText(/300\s*zł/).first()).toBeVisible();
});

test('публичная выписка показывает движения и итоговый баланс', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_public_tenant_profile', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'tenant-1',
      name: 'Тестовый арендатор',
      slug: 'test-tenant',
      weekly_payment: 300,
      next_payment_date: '2026-08-03',
      next_payment_amount: 300,
      payments: [{ id: 'payment-1', amount: 100, payment_date: '2026-07-27', comment: null }],
      payment_terms: [],
      payment_charges: [{ id: 'charge-1', due_date: '2026-08-03', period_start: '2026-07-28', period_end: '2026-08-03', amount: 300, status: 'open', is_automatic: true }],
      payment_adjustments: [],
      bikes: { id: 'bike-1', model: 'Rockrider' },
    }),
  }));

  await page.goto('./history/test-tenant/statement');
  await expect(page.getByText('Выписка', { exact: true })).toBeVisible();
  await expect(page.getByText('+100 zł')).toBeVisible();
  await expect(page.getByText('−300 zł')).toBeVisible();
});

test('публичная выписка учитывает контрольную корректировку баланса', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_public_tenant_profile', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'tenant-1', name: 'Тестовый арендатор', slug: 'test-tenant',
      accounting_start_date: '2026-09-01', opening_balance: 300,
      payments: [], payment_terms: [], payment_charges: [],
      payment_adjustments: [{ id: 'checkpoint', direction: 'charge', amount: 0, balance_override: 100, adjustment_date: '2026-09-10', comment: 'Сверка' }],
      bikes: null,
    }),
  }));

  await page.goto('./history/test-tenant/statement');
  await expect(page.getByText('100 zł', { exact: true })).toBeVisible();
});

test('успешный вход открывает админку без смены адреса логина', async ({ page }) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'user-1', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.signature`;
  await page.route('**/auth/v1/token**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 4102444800,
      refresh_token: 'e2e-refresh-token',
      user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com' },
    }),
  }));
  await page.route('**/rest/v1/rpc/get_dashboard_snapshot', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ tenants: [], bikes: [] }),
  }));

  // Без сессии админский роут показывает форму входа инлайн, без редиректа.
  await page.goto('./');
  await page.getByPlaceholder('Email адрес').fill('admin@example.com');
  await page.getByPlaceholder('Пароль').fill('secret');
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page).toHaveURL(/\/$/);
  // Шапка админки видна и на десктопе, и на мобильном: сессия поднялась, инлайн-логин ушёл.
  await expect(page.getByRole('button', { name: /Включить .* тему/ })).toBeVisible();
});

test('недельный вид показывает ожидаемое начисление и ссылку на выписку', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_public_tenant_profile', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'tenant-1',
      name: 'Тестовый арендатор',
      slug: 'test-tenant',
      weekly_payment: 300,
      next_payment_date: '2099-08-03',
      next_payment_amount: 300,
      payments: [],
      payment_terms: [],
      payment_charges: [{ id: 'charge-1', due_date: '2099-08-03', period_start: '2099-07-28', period_end: '2099-08-03', amount: 300, status: 'open', is_automatic: true }],
      payment_adjustments: [],
      bikes: { id: 'bike-1', model: 'Rockrider' },
    }),
  }));

  await page.goto('./history/test-tenant/weeks');
  await expect(page.getByText('Ожидается').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Выписка' }).first()).toBeVisible();
});

test('несуществующий арендатор показывает пустое состояние', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_public_tenant_profile', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(null),
  }));

  await page.goto('./no-such-tenant');
  await expect(page.getByText('История не найдена')).toBeVisible();
});
