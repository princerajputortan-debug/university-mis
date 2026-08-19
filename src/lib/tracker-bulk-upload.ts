import type { TrackerTableConfig } from '@/lib/tracker-tables';

export type TrackerInputRow = {
  line: number;
  id: number | null;
  name: string;
  prefix?: string;
};

export type TrackerRowIssue = {
  code:
    | 'invalid_id'
    | 'empty_name'
    | 'duplicate_id'
    | 'duplicate_name'
    | 'name_taken'
    | 'case_duplicate_name';
  message: string;
  field: 'id' | 'name' | 'row';
};

export function normalizeTrackerName(name: string): string {
  return name.trim().toLowerCase();
}

export function parseTrackerCsvRow(
  raw: Record<string, string>,
  config: TrackerTableConfig
): { id: number | null; name: string; prefix?: string } {
  const idRaw = raw.id ?? raw.ID ?? raw.Id ?? '';
  const name =
    raw[config.nameField] ??
    raw.name ??
    raw.Name ??
    '';
  const id = parseInt(String(idRaw).trim(), 10);
  const prefix =
    config.slug === 'enrollment'
      ? (raw.prefix ?? raw.Prefix ?? '').trim() || undefined
      : undefined;

  return {
    id: Number.isFinite(id) && id > 0 ? id : null,
    name: String(name).trim(),
    prefix,
  };
}

export function getTrackerCsvTemplate(config: TrackerTableConfig): string {
  if (config.slug === 'enrollment') {
    return 'id,enrollment,prefix\n1,UGL202232994,\n2,PGO202233260,\n';
  }
  return `id,${config.nameField}\n1,Example value\n2,Another value\n`;
}

export function findDuplicateNameKeys(rows: { id: number; name: string }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeTrackerName(row.name);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

export function getManualEntryIssues(
  id: number | null,
  name: string,
  existing: { id: number; name: string }[]
): TrackerRowIssue[] {
  return validateTrackerRows(
    [{ line: 0, id, name }],
    existing
  ).get(0) ?? [];
}

export function validateTrackerRows(
  inputs: TrackerInputRow[],
  existing: { id: number; name: string }[]
): Map<number, TrackerRowIssue[]> {
  const issues = new Map<number, TrackerRowIssue[]>();

  const addIssue = (line: number, issue: TrackerRowIssue) => {
    const list = issues.get(line) ?? [];
    if (!list.some(i => i.code === issue.code && i.message === issue.message)) {
      list.push(issue);
      issues.set(line, list);
    }
  };

  const idLines = new Map<number, number[]>();
  const nameLines = new Map<string, number[]>();

  for (const row of inputs) {
    if (!row.id) {
      addIssue(row.line, {
        code: 'invalid_id',
        message: 'Invalid or missing id',
        field: 'id',
      });
    }
    if (!row.name.trim()) {
      addIssue(row.line, {
        code: 'empty_name',
        message: 'Name is required',
        field: 'name',
      });
    }
    if (row.id) {
      const lines = idLines.get(row.id) ?? [];
      lines.push(row.line);
      idLines.set(row.id, lines);
    }
    if (row.name.trim()) {
      const key = normalizeTrackerName(row.name);
      const lines = nameLines.get(key) ?? [];
      lines.push(row.line);
      nameLines.set(key, lines);
    }
  }

  for (const [, lines] of idLines) {
    if (lines.length > 1) {
      for (const line of lines) {
        addIssue(line, {
          code: 'duplicate_id',
          message: `Duplicate id in upload (rows ${lines.map(l => l + 1).join(', ')})`,
          field: 'id',
        });
      }
    }
  }

  for (const [, lines] of nameLines) {
    if (lines.length > 1) {
      for (const line of lines) {
        addIssue(line, {
          code: 'duplicate_name',
          message: `Duplicate name in upload (rows ${lines.map(l => l + 1).join(', ')})`,
          field: 'name',
        });
      }
    }
  }

  const existingById = new Map(existing.map(r => [r.id, r.name]));
  const existingByName = new Map(
    existing.map(r => [normalizeTrackerName(r.name), { id: r.id, name: r.name }])
  );

  for (const row of inputs) {
    if (!row.id || !row.name.trim()) continue;

    const norm = normalizeTrackerName(row.name);
    const existingMatch = existingByName.get(norm);
    if (existingMatch && existingMatch.id !== row.id) {
      addIssue(row.line, {
        code: 'name_taken',
        message: `Name already used by id ${existingMatch.id} ("${existingMatch.name}")`,
        field: 'name',
      });
    }

    const existingName = existingById.get(row.id);
    if (existingName && normalizeTrackerName(existingName) !== norm) {
      const other = existingByName.get(norm);
      if (other && other.id !== row.id) {
        // already flagged as name_taken
      }
    }
  }

  const existingDupKeys = findDuplicateNameKeys(existing);
  for (const row of inputs) {
    const norm = normalizeTrackerName(row.name);
    if (norm && existingDupKeys.has(norm)) {
      addIssue(row.line, {
        code: 'case_duplicate_name',
        message: 'Matches an existing case-insensitive duplicate in the table',
        field: 'name',
      });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: Map<number, TrackerRowIssue[]>): boolean {
  for (const list of issues.values()) {
    if (list.some(i => i.code !== 'case_duplicate_name')) return true;
  }
  return false;
}

export function rowHasBlockingIssue(issues: TrackerRowIssue[] | undefined): boolean {
  if (!issues?.length) return false;
  return issues.some(i => i.code !== 'case_duplicate_name');
}
