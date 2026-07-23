import { addDays, format, getDay, parseISO } from 'date-fns';

export const DEFAULT_PAYMENT_DAY = 1;

export const PAYMENT_DAYS = [
    { value: 1, label: 'Понедельник' },
    { value: 2, label: 'Вторник' },
    { value: 3, label: 'Среда' },
    { value: 4, label: 'Четверг' },
    { value: 5, label: 'Пятница' },
    { value: 6, label: 'Суббота' },
    { value: 7, label: 'Воскресенье' }
];

export const PAYMENT_DAY_ABBREVIATIONS = {
    1: 'ПН',
    2: 'ВТ',
    3: 'СР',
    4: 'ЧТ',
    5: 'ПТ',
    6: 'СБ',
    7: 'ВС'
};

function toDate(value) {
    return typeof value === 'string' ? parseISO(value) : new Date(value);
}

/**
 * Returns the ISO weekday number for a JavaScript date.
 * @param {Date|string} value Date or yyyy-MM-dd value.
 * @returns {number} Weekday from 1 (Monday) through 7 (Sunday).
 */
export function getPaymentDay(value) {
    const sundayBasedDay = getDay(toDate(value));
    return sundayBasedDay === 0 ? 7 : sundayBasedDay;
}

/**
 * Returns the standard two-letter Russian weekday abbreviation.
 * @param {Date|string} value Date or yyyy-MM-dd value.
 * @returns {string} Weekday abbreviation such as ПН, ПТ, or СБ.
 */
export function getPaymentDayAbbreviation(value) {
    return PAYMENT_DAY_ABBREVIATIONS[getPaymentDay(value)];
}

/**
 * Finds the next occurrence of a tenant's weekly payment day after a date.
 * @param {Date|string} value Date or yyyy-MM-dd value used as the starting point.
 * @param {number} paymentDay ISO weekday from 1 (Monday) through 7 (Sunday).
 * @returns {string} Next scheduled date in yyyy-MM-dd format.
 */
export function getNextPaymentDate(value, paymentDay = DEFAULT_PAYMENT_DAY) {
    const date = toDate(value);
    const currentDay = getPaymentDay(date);
    const daysUntilPayment = ((paymentDay - currentDay + 7) % 7) || 7;
    return format(addDays(date, daysUntilPayment), 'yyyy-MM-dd');
}

/**
 * Finds the selected weekday on or after a date, for creating a schedule.
 * @param {Date|string} value Date or yyyy-MM-dd value used as the starting point.
 * @param {number} paymentDay ISO weekday from 1 (Monday) through 7 (Sunday).
 * @returns {string} Scheduled date in yyyy-MM-dd format.
 */
export function getScheduledPaymentDate(value, paymentDay = DEFAULT_PAYMENT_DAY) {
    const date = toDate(value);
    const currentDay = getPaymentDay(date);
    const daysUntilPayment = (paymentDay - currentDay + 7) % 7;
    return format(addDays(date, daysUntilPayment), 'yyyy-MM-dd');
}
