// Функция парсинга CSV (без библиотек, просто split)
function parseCSV(csvText) {
  const rows = csvText.trim().split('\n').map(row => row.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
  return rows;
}

// Функция парсинга даты (поддержка dd.mm.yyyy и YYYY-MM-DD)
function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();
  
  // Попытка ISO (YYYY-MM-DD)
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  
  // dd.mm.yyyy
  const parts = str.split('.');
  if (parts.length === 3) {
    d = new Date(parts[2], parts[1] - 1, parts[0]);
    if (!isNaN(d.getTime())) return d;
  }
  
  return null;
}

async function loadData() {
  const urlParams = new URLSearchParams(window.location.search);
  const gid = urlParams.get('gid');
  const sheetNameFromUrl = urlParams.get('sheet'); // опционально для отображения

  if (!gid) {
    document.getElementById('full-name').textContent = 'Ошибка: нет gid в ссылке';
    return;
  }

  const spreadsheetId = '1a0D1Xae8M7AXeVw3L7HVtSNhQLQ6DTmS44si0LLz1CA'; // твой ID

  const csvUrl = `https://docs.google.com/spreadsheets/d/e/2PACX-1vRvOQsNUxTTxlqKjxMtyUh7Rq5JbEtXRI8vnM8-h0XiOEz7vNvqbfkN9Xp49MQfkFqNRyB5fub1bKe5/pub?output=csv&gid=${gid}`;

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error('Не удалось загрузить данные');
    const csv = await response.text();

    const rows = parseCSV(csv);

    // Имя из названия листа
    const fullName = sheetNameFromUrl || 'Арендатор';
    document.getElementById('full-name').textContent = fullName;

    // A1 B1 C1 D1
    const bikeModel = rows[0]?.[0] || '—';
    const weeklyTariff = parseFloat(rows[0]?.[1]) || 0;
    const balance = parseFloat(rows[0]?.[2]) || 0; // C1: сумма в zł (положит. — переплата, отриц. — долг)
    const clientComment = rows[0]?.[3] || '';

    document.getElementById('bike-model').textContent = bikeModel;
    document.getElementById('tariff').textContent = `Тариф: ${weeklyTariff} zł/неделя`;
    document.getElementById('client-comment').textContent = clientComment;

    // Сегодняшняя дата
    const today = new Date(); // для теста можно new Date('2026-01-30')

    // Находим последнюю дату платежа (столбец A, начиная с индекса 2)
    let lastPaymentDate = null;
    let hasPayments = false;

    for (let i = 2; i < rows.length; i++) {
      const dateStr = rows[i][0];
      const paymentDate = parseDate(dateStr);
      if (paymentDate) {
        if (!lastPaymentDate || paymentDate > lastPaymentDate) {
          lastPaymentDate = paymentDate;
        }
        hasPayments = true;
      }
    }

    let remainingDays = 0;
    let debt = 0;
    let payUntilText = '—';

    const dailyRate = weeklyTariff / 7;

    if (balance !== 0) {
      // Ручной режим по C1 (приоритет)
      if (balance > 0) {
        remainingDays = Math.floor(balance / dailyRate);
      } else {
        debt = Math.abs(balance);
      }
      payUntilText = 'Оплачено вручную';
    } else if (hasPayments && lastPaymentDate) {
      // Авто-режим: от последней оплаты
      const diffDays = Math.floor((today - lastPaymentDate) / (1000 * 60 * 60 * 24));
      remainingDays = 7 - diffDays;

      const endDate = new Date(lastPaymentDate);
      endDate.setDate(endDate.getDate() + 7);
      payUntilText = `Оплачено до: ${endDate.toLocaleDateString('ru-RU')}`;

      if (remainingDays < 0) {
        debt = Math.abs(remainingDays) * dailyRate;
      }
    } else {
      // Нет платежей и нет ручного баланса
      remainingDays = 0;
      payUntilText = 'Нет оплат';
    }

    // Отображаем
    document.getElementById('days-left').textContent = `Осталось дней: ${Math.max(remainingDays, 0)}`;
    document.getElementById('pay-until').textContent = payUntilText;

    const debtEl = document.getElementById('debt');
    if (debt > 0) {
      debtEl.textContent = `Задолженность: ${Math.round(debt)} zł`;
      debtEl.classList.remove('debt-hidden');
    } else {
      debtEl.classList.add('debt-hidden');
      debtEl.textContent = '';
    }

  } catch (err) {
    console.error(err);
    document.getElementById('full-name').textContent = 'Ошибка загрузки данных';
  }
}

loadData();