import { getStoredLanguage, translate } from '../../i18n/translate';

const EN_ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Invalid email or password'],
  [/email not confirmed/i, 'Confirm your email address before signing in'],
  [/jwt expired|invalid jwt/i, 'Session expired. Sign in again'],
  [/failed to fetch|networkerror|network request failed/i, 'Could not connect. Check your internet connection'],
  [/permission denied|row-level security/i, 'You do not have permission for this action'],
  [/duplicate key value violates unique constraint "tenants_slug_key"/i, 'A tenant with this link alias already exists'],
  [/duplicate key value violates unique constraint "bikes_serial_number_key"/i, 'A bike with this serial number already exists'],
  [/duplicate key value violates unique constraint/i, 'A record with these values already exists'],
  [/violates foreign key constraint/i, 'This record is still linked to other data'],
  [/violates check constraint/i, 'The data does not meet the required constraints'],
  [/bike not found/i, 'Bike not found'],
  [/tenant not found/i, 'Tenant not found'],
  [/tenant name and slug are required/i, 'Tenant name and link alias are required'],
  [/first payment date is required/i, 'First payment date is required'],
  [/rental start date is required/i, 'Rental start date is required'],
  [/rental end date is required/i, 'Rental end date is required'],
  [/rental end reason is required/i, 'Rental end reason is required'],
  [/rental end date must not be in the future/i, 'Rental end date must not be in the future'],
  [/final amount must not be negative/i, 'Final amount must not be negative'],
  [/tenant has no active rental/i, 'Tenant has no active rental'],
  [/unarchive tenant before assigning a bike/i, 'Restore the tenant from the archive before assigning a bike'],
  [/bike is already assigned to another tenant/i, 'Bike is already assigned to another tenant'],
  [/bike cannot be in rent without an assigned tenant/i, 'Bike cannot be in rent without an assigned tenant'],
  [/bike is not available/i, 'Bike is not available'],
  [/assign the bike from a tenant profile/i, 'Assign the bike from a tenant profile'],
  [/finish or reassign the rental before changing this bike status/i, 'Finish or reassign the rental before changing this bike status'],
  [/bike model is required/i, 'Bike model is required'],
  [/bike status cannot be in_rent while it is linked to a tenant/i, 'Finish the rental before changing this bike status'],
  [/invalid bike status/i, 'Invalid bike status'],
  [/invalid tenant payment terms|invalid payment terms/i, 'Invalid payment terms'],
  [/invalid expected payment/i, 'Invalid expected payment'],
  [/payment amount cannot be negative/i, 'Payment amount cannot be negative'],
  [/payment amount must be greater than zero/i, 'Payment amount must be greater than zero'],
  [/payment date is required/i, 'Payment date is required'],
  [/payment date must not be in the future/i, 'Payment date must not be in the future'],
  [/pending payment request not found/i, 'Pending payment request not found'],
  [/only admins can approve payment requests/i, 'Only admins can approve payment requests'],
  [/only admins can reject payment requests/i, 'Only admins can reject payment requests'],
  [/only admins can approve payment charges/i, 'Only admins can approve payment charges'],
  [/open payment charge not found/i, 'Open payment charge not found'],
  [/rejection reason is required/i, 'Rejection reason is required'],
  [/reference date is required/i, 'Reference date is required'],
  [/invalid accounting reset data/i, 'Invalid accounting reset data'],
  [/tenant id is required to delete a charge/i, 'Tenant ID is required to delete a charge'],
  [/adjustment id is required when editing an adjustment/i, 'Adjustment ID is required when editing an adjustment'],
  [/^google tasks: /i, 'Google Tasks: '],
];

function localizeEnglish(message: string): string {
  for (const [pattern, replacement] of EN_ERROR_PATTERNS) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return translate('en', message);
}

export function getErrorMessage(error: unknown): string {
  let message = 'Неизвестная ошибка';
  if (error instanceof Error) message = error.message;
  else if (typeof error === 'string') message = error;
  else if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    message = error.message;
  }
  return getStoredLanguage() === 'en' ? localizeEnglish(translate('en', message)) : message;
}
