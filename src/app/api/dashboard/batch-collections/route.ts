import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter') || 'today';
  
  let gte: Date;
  let lte: Date;
  
  const now = new Date();
  
  if (filter === 'today') {
    gte = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    lte = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (filter === 'yesterday') {
    gte = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    lte = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  } else if (filter === 'month') {
    const month = parseInt(searchParams.get('month') || String(now.getMonth()), 10);
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
    gte = new Date(year, month, 1);
    lte = new Date(year, month + 1, 0, 23, 59, 59, 999);
  } else {
    gte = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    lte = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }

  try {
    const payments = await prisma.consolidatedPayment.findMany({
      where: {
        date: { gte, lte },
        sourceName: { in: ['Razorpay', 'Jodo', 'Early', 'Offline', 'Bank', 'Propelld', 'Corp Inst'] }
      },
      select: {
        batch: { select: { batch: true } },
        sourceName: true,
        amount: true,
      },
    });

    const sources = ['Razorpay', 'Jodo', 'Early', 'Offline', 'Bank', 'Propelld', 'Corp Inst'];
    
    // Group by batch
    const grouped: any = {};
    
    payments.forEach(p => {
      let b = p.batch?.batch?.trim() || 'Others';
      // normalize 'Reco ' to 'Reco'
      if (b === 'Reco ') b = 'Reco';
      
      if (!grouped[b]) {
        grouped[b] = {};
        sources.forEach(s => grouped[b][s] = 0);
        grouped[b].Total = 0;
      }
      
      const amt = p.amount || 0;
      grouped[b][p.sourceName] = (grouped[b][p.sourceName] || 0) + amt;
      grouped[b].Total += amt;
    });

    // Convert to array
    const data = Object.keys(grouped).map(batch => ({
      batch,
      ...grouped[batch]
    })).sort((a, b) => b.Total - a.Total); // Sort by total descending

    return NextResponse.json({ data, sources });
  } catch (error) {
    console.error('API Error (batch-collections):', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
