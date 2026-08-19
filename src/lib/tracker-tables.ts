export type TrackerTableConfig = {
  slug: string;
  menuLabel: string;
  title: string;
  prismaModel: string;
  nameField: string;
};

/** Lookup tables linked to AdmissionForm via foreign keys. */
export const TRACKER_TABLES: TrackerTableConfig[] = [
  { slug: 'lead-source', menuLabel: 'lead_source_id', title: 'Lead Source', prismaModel: 'leadSource', nameField: 'lead' },
  { slug: 'counselor', menuLabel: 'Councellor_id', title: 'Councellor', prismaModel: 'counselor', nameField: 'counselor' },
  { slug: 'team', menuLabel: 'team_id', title: 'Team', prismaModel: 'team', nameField: 'team' },
  { slug: 'bifurcation', menuLabel: 'bifurcation_id', title: 'Bifurcation', prismaModel: 'bifurcation', nameField: 'bifurcation' },
  { slug: 'program', menuLabel: 'program_id', title: 'Program', prismaModel: 'program', nameField: 'program' },
  { slug: 'batch', menuLabel: 'batch_id', title: 'Batch', prismaModel: 'batch', nameField: 'batch' },
  { slug: 'enrollment', menuLabel: 'Enrollment', title: 'Enrollment', prismaModel: 'enrollment', nameField: 'enrollment' },
];

export function getTrackerTable(slug: string): TrackerTableConfig | undefined {
  return TRACKER_TABLES.find(t => t.slug === slug);
}
