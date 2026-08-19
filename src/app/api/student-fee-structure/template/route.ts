import { NextResponse } from 'next/server';

export async function GET() {
  const headers = [
    'Enrollment No',
    'Type (UG/PG)',
    'Program',
    'Batch',
    'Payment Option',
    'Coupon Name',
    'Coupon Name 2',
    'Coupon Name 3',
    'Sem 1 Fee',
    'Sem 1 Scholarship',
    'Sem 2 Fee',
    'Sem 2 Scholarship',
    'Sem 3 Fee',
    'Sem 3 Scholarship',
    'Sem 4 Fee',
    'Sem 4 Scholarship',
    'Sem 5 Fee',
    'Sem 5 Scholarship',
    'Sem 6 Fee',
    'Sem 6 Scholarship',
  ];

  const exampleRow = [
    'PGO26885540',
    'PG',
    'MBA Online',
    'Batch 9',
    'Full Fee',
    'EARLYBIRD',
    'REFERRAL',
    '',
    '50000',
    '5000',
    '50000',
    '0',
    '50000',
    '0',
    '50000',
    '0',
    '',
    '',
    '',
    ''
  ];

  const csvContent = [
    headers.join(','),
    exampleRow.join(',')
  ].join('\n');

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="fee_structure_template.csv"'
    }
  });
}
