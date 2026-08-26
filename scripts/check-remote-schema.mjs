import fs from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;

async function readEnv(file, name) {
    const contents = await fs.readFile(`${root}${file}`, 'utf8');
    return contents.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim();
}

const targetUrl = await readEnv('.env.local', 'VITE_SUPABASE_URL');
const targetKey = await readEnv('.env.migration', 'SUPABASE_TARGET_SERVICE_ROLE_KEY');
if (!targetUrl || !targetKey) throw new Error('Missing .env.local or .env.migration target configuration');

const headers = { apikey: targetKey, Authorization: `Bearer ${targetKey}` };

async function request(path, options = {}) {
    const response = await fetch(`${targetUrl}${path}`, { ...options, headers: { ...headers, ...options.headers } });
    const body = await response.text();
    return { status: response.status, body };
}

function includesMessage(result, message) {
    return result.status === 400 && result.body.toLowerCase().includes(message.toLowerCase());
}

const [
    tenantsResult,
    bikesResult,
    rentalEventsResult,
    chargesResult,
    adjustmentsResult,
    updateResult,
    createResult,
    bikeUpdateResult,
    dayOffResult,
    finishRentalResult,
] = await Promise.all([
    request('/rest/v1/tenants?select=id,bike_id,is_archived,discount_amount&limit=1000'),
    request('/rest/v1/bikes?select=id,status&limit=1000'),
    request('/rest/v1/tenant_rental_events?select=id,tenant_id,event_type,effective_date&limit=5000'),
    request('/rest/v1/tenant_payment_charges?select=id,breakdown&limit=5000'),
    request('/rest/v1/tenant_payment_adjustments?select=id,source_event_id&limit=5000'),
    request('/rest/v1/rpc/update_tenant_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            p_tenant_id: '00000000-0000-0000-0000-000000000000', p_name: 'schema-probe', p_slug: 'schema-probe',
            p_bike_id: null, p_weekly_payment: 0, p_payment_day: 1, p_next_payment_date: null,
            p_deposit: 0, p_admin_comment: null, p_phone: null, p_telegram_username: null, p_battery_config: null
        })
    }),
    request('/rest/v1/rpc/create_tenant_with_rental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            p_name: 'schema-probe', p_slug: `schema-probe-${Date.now()}`,
            p_bike_id: '00000000-0000-0000-0000-000000000000', p_weekly_payment: 0, p_payment_day: 1,
            p_first_payment_date: '2026-08-23', p_deposit: 0, p_phone: null,
            p_telegram_username: null, p_battery_config: null
        })
    }),
    request('/rest/v1/rpc/update_bike_inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            p_bike_id: '00000000-0000-0000-0000-000000000000', p_model: 'schema-probe', p_type: '', p_status: 'available'
        })
    }),
    request('/rest/v1/rpc/add_tenant_day_off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            p_tenant_id: '00000000-0000-0000-0000-000000000000',
            p_day_off_date: '2026-08-27', p_reason: 'schema-probe'
        })
    }),
    request('/rest/v1/rpc/finish_tenant_rental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            p_tenant_id: '00000000-0000-0000-0000-000000000000',
            p_end_date: '2020-01-01', p_final_amount: 0, p_reason: 'schema-probe'
        })
    })
]);

const tableResults = [tenantsResult, bikesResult, rentalEventsResult, chargesResult, adjustmentsResult];
if (tableResults.some(result => result.status !== 200)) {
    throw new Error(`Could not read target tables: ${tableResults.map(result => result.status).join(', ')}`);
}

const tenants = JSON.parse(tenantsResult.body);
const bikes = JSON.parse(bikesResult.body);
const rentalEvents = JSON.parse(rentalEventsResult.body);
const charges = JSON.parse(chargesResult.body);
const assignments = new Map();
for (const tenant of tenants) if (tenant.bike_id) assignments.set(tenant.bike_id, (assignments.get(tenant.bike_id) || 0) + 1);
const bikeIds = new Set(bikes.map(bike => bike.id));
const duplicateAssignments = [...assignments].filter(([, count]) => count > 1);
const unassignedInRent = bikes.filter(bike => bike.status === 'in_rent' && !assignments.has(bike.id));
const assignedNotInRent = tenants.filter(tenant => tenant.bike_id && bikeIds.has(tenant.bike_id)
    && bikes.find(bike => bike.id === tenant.bike_id)?.status !== 'in_rent');
const eventTenantIds = new Set(rentalEvents.map(event => event.tenant_id));
const activeTenantsWithoutEvents = tenants.filter(tenant => tenant.bike_id && !eventTenantIds.has(tenant.id));

const checks = {
    tenantProfileRpc: includesMessage(updateResult, 'Tenant not found'),
    tenantCreationRpc: includesMessage(createResult, 'Bike not found'),
    bikeInventoryRpc: includesMessage(bikeUpdateResult, 'Bike not found'),
    dayOffRpc: includesMessage(dayOffResult, 'Tenant not found'),
    finishRentalRpc: includesMessage(finishRentalResult, 'Tenant not found'),
    activeRentalsHaveEvents: activeTenantsWithoutEvents.length === 0,
    chargeBreakdownsAreJson: charges.every(charge => Array.isArray(charge.breakdown)),
    uniqueBikeAssignments: duplicateAssignments.length === 0,
    rentedBikesHaveTenants: unassignedInRent.length === 0,
    assignedBikesAreInRent: assignedNotInRent.length === 0
};

console.log(JSON.stringify({
    rowCounts: {
        tenants: tenants.length,
        bikes: bikes.length,
        rentalEvents: rentalEvents.length,
        charges: charges.length,
    },
    checks,
    rpcStatuses: {
        updateTenantProfile: updateResult.status,
        createTenantWithRental: createResult.status,
        updateBikeInventory: bikeUpdateResult.status,
        addTenantDayOff: dayOffResult.status,
        finishTenantRental: finishRentalResult.status,
    }
}, null, 2));

if (Object.values(checks).some(value => !value)) {
    console.error('Remote schema/data checks failed. Apply the pending migrations before deploying the current frontend.');
    process.exit(1);
}
