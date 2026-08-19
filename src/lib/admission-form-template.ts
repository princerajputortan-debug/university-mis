/**
 * CSV layout aligned with Software-main_data_base (reference export).
 * All lookup columns are numeric ids from Software-*_id.csv / Database lookup tables.
 * Enrollment_No = Enrollment.id (not the text enrollment code).
 */
export const ADMISSION_FORM_TEMPLATE_HEADERS = [
  'Sno',
  'Date_of_Admission',
  'Enrollment_No',
  'Name',
  'Batch',
  'Payment_option',
  'Type',
  'Status',
  'Placed Status',
  'Program',
  'Lead_source',
  'Councellor',
  'Team',
  'Bifurcation',
  'Location',
  'nationality',
  'UGC_Status',
  'Adhar',
] as const;

/** Example row — ids must exist in lookup tables + Enrollment before upload. */
export const ADMISSION_FORM_TEMPLATE_SAMPLE = {
  Sno: 1,
  Date_of_Admission: '2022-11-21',
  Enrollment_No: 1,
  Name: 'Alice Majnu Baxla',
  Batch: 1,
  Payment_option: 1,
  Type: 2,
  Status: 2,
  'Placed Status': 1,
  Program: 5,
  Lead_source: 1,
  Councellor: '',
  Team: 1,
  Bifurcation: 4,
  Location: 9,
  nationality: 1,
  UGC_Status: 1,
  Adhar: '',
};

export function getAdmissionFormTemplateRows() {
  return [ADMISSION_FORM_TEMPLATE_SAMPLE];
}
