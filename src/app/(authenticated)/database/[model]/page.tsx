import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildModelSearchWhere } from '@/lib/prisma-search';
import { formatModelRows, getModelDisplayConfig } from '@/lib/database-display';
import {
  fetchPaymentTableRows,
  isLegacyPaymentModel,
  sumPaymentTableAmount,
  usesPaymentRawQueries,
} from '@/lib/legacy-payment-tables';

export const dynamic = 'force-dynamic';

export default async function ModelTablePage({ 
  params,
  searchParams
}: { 
  params: Promise<{ model: string }>,
  searchParams: Promise<{ q?: string, start?: string, end?: string }>
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const modelName = resolvedParams.model;
  const { q, start, end } = resolvedSearchParams;

  // Validate that the model exists in Prisma
  if (!(modelName in prisma)) {
    notFound();
  }

  const modelDmmf = Prisma.dmmf.datamodel.models.find(m => m.name.toLowerCase() === modelName.toLowerCase());
  const hasField = (fieldName: string): boolean =>
    !!modelDmmf?.fields.some(f => f.name === fieldName);

  const whereClause: Record<string, unknown> = {};
  const AND: Record<string, unknown>[] = [];
  
  if (q) {
    const searchConditions = buildModelSearchWhere(modelName, q, hasField);
    if (searchConditions.length > 0) {
      AND.push({ OR: searchConditions });
    }
  }

  if (start || end) {
    const dateFilter: Record<string, Date> = {};
    if (start) dateFilter.gte = new Date(start);
    if (end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }
    
    if (hasField('date')) {
       AND.push({ date: dateFilter });
    } else if (hasField('createdAt')) {
       AND.push({ createdAt: dateFilter });
    }
  }

  if (AND.length > 0) {
    whereClause.AND = AND;
  }

  const displayConfig = getModelDisplayConfig(modelName);
  const paymentRaw = isLegacyPaymentModel(modelName) && (await usesPaymentRawQueries(modelName));

  let data: Record<string, unknown>[];
  let totalAmount = 0;

  if (paymentRaw) {
    data = await fetchPaymentTableRows(modelName, {
      q,
      start,
      end,
      limit: 50,
    });
    totalAmount = await sumPaymentTableAmount(modelName, { q, start, end });
  } else {
    const findManyArgs: Record<string, unknown> = {
      where: whereClause,
      take: 50,
      orderBy: { id: 'desc' },
    };
    if (displayConfig?.include) {
      findManyArgs.include = displayConfig.include;
    }

        const rawData = await (prisma as any)[modelName].findMany(findManyArgs);
    data = formatModelRows(modelName, rawData);

    if (hasField('amount')) {
            const agg = await (prisma as any)[modelName].aggregate({
        where: whereClause,
        _sum: { amount: true },
      });
      totalAmount = agg._sum.amount || 0;
    }
  }

  // Fetch the first 50 rows for this model
  // (legacy path populated above)

  if (!data || !Array.isArray(data)) {
    return <div>Error loading data for {modelName}</div>;
  }

  // Extract columns from the first row, or fallback to empty
  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  // Build the export URL with current filters
  const exportUrl = new URL(`/api/export/${modelName}`, 'http://localhost');
  if (q) exportUrl.searchParams.set('q', q);
  if (start) exportUrl.searchParams.set('start', start);
  if (end) exportUrl.searchParams.set('end', end);
  const exportHref = exportUrl.pathname + exportUrl.search;

  return (
    <div className="animate-fade-in" style={{ padding: '0 1rem', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link href="/database" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }}>
          ← Back
        </Link>
        <h1 style={{ margin: 0 }}>{modelName}</h1>
        <span style={{ color: 'var(--text-muted)' }}>(Showing up to 50 latest records)</span>
        <a 
          href={exportHref}
          className="btn btn-primary" 
          style={{ 
            background: '#10B981', 
            borderColor: '#10B981',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1.2rem',
            marginLeft: 'auto',
            fontSize: '0.875rem',
            fontWeight: 600,
            borderRadius: '8px',
            color: '#fff',
            textDecoration: 'none'
          }}
          download
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Export to Excel
        </a>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', alignItems: 'flex-start' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', flex: 1 }}>
          <form method="GET" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Search (Transaction / Enrollment)</label>
              <input type="text" name="q" defaultValue={q || ''} className="form-input" placeholder="Search..." />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Start Date</label>
              <input type="date" name="start" defaultValue={start || ''} className="form-input" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>End Date</label>
              <input type="date" name="end" defaultValue={end || ''} className="form-input" />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>Apply Filters</button>
              {(q || start || end) && (
                <Link href={`/database/${modelName}`} className="btn btn-secondary" style={{ padding: '0.75rem 1rem' }}>Clear</Link>
              )}
            </div>
          </form>
        </div>

        {(paymentRaw || hasField('amount')) && (
          <div className="stat-card" style={{ minWidth: '250px' }}>
             <div className="stat-card-top">
                <span className="stat-label">Total Filtered Amount</span>
             </div>
             <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>
                ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
             </div>
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ overflowX: 'auto', padding: '1rem' }}>
        {data.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No records found for the current filters.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                {columns.map(col => (
                  <th key={col} style={{ padding: '0.75rem', fontWeight: 600, border: '1px solid var(--border-subtle)' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.id != null && Number(row.id) > 0 ? String(row.id) : `row-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {columns.map(col => {
                    let cellVal = row[col];
                    if (cellVal instanceof Date) {
                      cellVal = cellVal.toLocaleString();
                    } else if (typeof cellVal === 'object' && cellVal !== null) {
                      cellVal = JSON.stringify(cellVal);
                    }
                    return (
                      <td key={col} style={{ padding: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid var(--border-subtle)' }}>
                        {cellVal !== null && cellVal !== undefined ? String(cellVal) : <span style={{ color: 'var(--text-muted)' }}>null</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
