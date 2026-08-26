import { expect, test } from '@playwright/test';

test('главная страница доступна в светлой и тёмной теме', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      localStorage.setItem('theme', value);
      document.documentElement.classList.toggle('dark', value === 'dark');
    }, theme);
    await page.screenshot({ path: testInfo.outputPath(`home-${theme}.png`), fullPage: true });
  }
});

test('ошибка авторизации показывается доступным текстом', async ({ page }) => {
  await page.route('**/auth/v1/token**', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Invalid login credentials' }),
  }));
  await page.goto('./#/admin/login');
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
  await page.goto('./#/test-tenant');
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

  await page.goto('./#/history/test-tenant/statement');
  await expect(page.getByRole('heading', { name: 'Statement' })).toBeVisible();
  await expect(page.getByText('+100 zł')).toBeVisible();
  await expect(page.getByText('open')).toBeVisible();
});
