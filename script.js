// Функция парсинга CSV (без библиотек, просто split)
function parseCSV(csvText) {
  const rows = csvText.trim().split('\n').map(row => row.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
  return rows;
}

async function loadData() {
  const urlParams = new URLSearchParams(window.location.search);
  const gid = urlParams.get('gid');
  const sheetNameFromUrl = urlParams.get('sheet'); // опционально для отображения

  if (!gid) {
    document.getElementById('full-name').textContent = 'Ошибка: нет gid в ссылке';
    return;
  }

  const spreadsheetId = '/d/1a0D1Xae8M7AXeVw3L7HVtSNhQLQ6DTmS44si0LLz1CA/'; // замени на свой

  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error('Не удалось загрузить данные');
    const csv = await response.text();

    const rows = parseCSV(csv);

    // Имя из названия листа (если передали в URL) или fallback
    const fullName = sheetNameFromUrl || 'Арендатор';

    document.getElementById('full-name').textContent = fullName;

    // A1 B1 C1 D1
    const bikeModel = rows[0]?.[0] || '—';
    const weeklyTariff = parseFloat(rows[0]?.[1]) || 0;
    let balance = parseFloat(rows[0]?.[2]) || 0;
    const clientComment = rows[0]?.[3] || '';

    document.getElementById('bike-model').textContent = bikeModel;
    document.getElementById('tariff').textContent = `Тариф: ${weeklyTariff} ₽/неделя`;
    document.getElementById('client-comment').textContent = clientComment;

    // История платежей начинается примерно с row 2-3 (индекс 2+)
    let paidDays = 0;
    for (let i = 2; i < rows.length; i++) { // пропускаем 0 и 1 строки
      const amount = parseFloat(rows[i][2]) || 0;
      if (amount > 0 && weeklyTariff > 0) {
        paidDays += Math.round(amount / weeklyTariff) * 7; // дни
      }
    }

    // Если в C1 есть значение — используем его как приоритет (ручной долг/баланс)
    let remainingDays = 0;
    let debt = 0;
    let payUntil = '—';

    if (balance !== 0) {
      // ручной режим
      if (balance > 0) {
        remainingDays = balance; // если ты пишешь в днях, измени логику
      } else {
        debt = Math.abs(balance);
      }
    } else {
      // авто-режим по платежам
      remainingDays = paidDays; // предполагаем, что paidDays — это накопленные дни
      // Здесь можно улучшить: найти последнюю дату + paidDays
    }

    document.getElementById('days-left').textContent = `Осталось дней: ${remainingDays}`;
    document.getElementById('pay-until').textContent = `Оплачено до: ${payUntil}`;

    const debtEl = document.getElementById('debt');
    if (debt > 0) {
      debtEl.textContent = `Задолженность: ${debt} ₽`;
      debtEl.classList.remove('debt-hidden');
    }

  } catch (err) {
    console.error(err);
    document.getElementById('full-name').textContent = 'Ошибка загрузки данных';
  }
}

loadData();