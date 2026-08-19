export const DROPDOWNS = {
  paymentOptions: [
    'Corporate', 'Direct_Selling', 'Executive_MBA', 'Opt_Out', 'Pay_After_Placement', 'Power_Program', 'Others'
  ],
  batches: [
    'Batch 1', 'Batch 2', 'Batch 3', 'Batch 4', 'Batch 5', 'Batch 6', 'Batch 7', 'Batch 8', 'Batch 9', 'Batch 10'
  ],
  types: ['UG', 'PG'],
  statuses: ['Cancelled', 'Passout', 'Pursuing', 'Refund', 'Inactive'],
  /** @deprecated Use getPlacementStatuses() from DB (Software-placement_id) */
  placedStatuses: ['opt out', 'pending to place', 'placed', 'Not Eligible'],
  programs: [
    'B.Com (Hons.) Online', 'BA ODL', 'BAJMC Online', 'BBA Online', 'BCA Online', 
    'Executive MBA Online', 'MA English', 'MAJMC Online', 'MBA Online', 'MCA Online', 'MSc (Data Science)'
  ],
  teams: [
    'Adda247', 'Support', 'Ankur', 'App', 'Batch 1', 'Batch 2', 'Channel', 'CSC', 'Direct Selling', 
    'International', 'Mohali', 'Panchkula', 'Physics Wallah', 'Shobhit Anand', 'Solan', 'Corporate', 
    'Not Found', 'JSW', 'Sahyog', 'Satin'
  ],
  bifurcations: [
    'App', 'Batch 1', 'Batch 2', 'Channel Partner', 'Corporate', 'DS', 'HP', 'Insides', 
    'International', 'Referral', 'Not Found'
  ],
  nationalities: ['Indian', 'Others', 'indian', 'international'],
  ugcStatuses: ['UGC', 'Transfer', 'cancelled', 'ERP', 'Bypass'],
  leadSources: [] as string[],
  indianStates: [
    'Rajasthan', 'Delhi', 'Punjab', 'Haryana', 'Himachal Pradesh', 'Uttar Pradesh', 
    'Gujarat', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Kerala', 'West Bengal', 
    'Bihar', 'Madhya Pradesh', 'Andhra Pradesh', 'Telangana'
  ],
  countries: [
    'USA', 'Canada', 'Australia', 'UAE', 'Nepal', 'Bhutan', 'UK', 'Germany', 'France', 'Singapore'
  ]
};

export const TEAM_BIFURCATION_MAPPING: Record<string, string[]> = {
  'Adda247': ['Channel Partner'],
  'Support': ['Referral'],
  'Ankur': ['HP'],
  'App': ['App'],
  'Batch 1': ['Batch 1'],
  'Batch 2': ['Batch 2'],
  'Channel': ['Channel Partner'],
  'CSC': ['HP'],
  'Panchkula': ['International', 'Insides'],
  'Shobhit Anand': ['HP'],
  'Corporate': ['Corporate'],
  'Not Found': ['Not Found'],
  'JSW': ['Corporate'],
  'Sahyog': ['Corporate'],
  'Satin': ['Corporate'],
  'Direct Selling': ['DS', 'Referral'],
  'International': ['Channel Partner', 'International'],
  'Mohali': ['International', 'Insides'],
  'Physics Wallah': ['Channel Partner', 'Insides'],
  'Solan': ['International', 'Insides']
};
