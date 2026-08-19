import {
  countLegacyAdmissionForms,
  fetchLegacyAdmissionForms,
  loadLegacyLookupMaps,
  legacyRowToFeeInput,
  mapLegacyRowToForm,
} from '../src/lib/legacy-admission-form.ts';

const rows = await fetchLegacyAdmissionForms({ skip: 0, limit: 5, filters: {} });
const total = await countLegacyAdmissionForms({});
const maps = await loadLegacyLookupMaps(rows);

console.log('rows:', rows.length, 'total:', total);
console.log(
  'sample:',
  mapLegacyRowToForm(rows[0], maps, {
    feeAsPerStructure: 1000,
    totalFee: 6000,
    scholarship: 0,
    recdFee: 2000,
    pendingFee: 4000,
  }).enrollmentNo
);
