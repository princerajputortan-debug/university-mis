import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE() {
  try {
    const result = await prisma.studentFeeStructure.deleteMany({});
    return NextResponse.json({ 
      success: true, 
      message: `Successfully deleted ${result.count} student fee records.` 
    });
  } catch (error: unknown) {
    console.error('Clear Student Fee Structure Error:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
