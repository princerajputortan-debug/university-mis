'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { exportFilteredForms } from './actions';
import Loader from '@/components/Loader';
import { useSearchParams } from 'next/navigation';

export default function ExportButton() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const handleExport = async () => {
    try {
      setLoading(true);
      
      const filters = {
        program: searchParams.get('program') || '',
        batch: searchParams.get('batch') || '',
        category: searchParams.get('category') || '',
        placedStatus: searchParams.get('placedStatus') || '',
      };
      
      const forms = await exportFilteredForms(filters);
      
      if (forms.length === 0) {
        alert('No admission forms found for the selected filters.');
        setLoading(false);
        return;
      }

      // Convert the JSON to an Excel sheet
      const worksheet = XLSX.utils.json_to_sheet(forms);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Admission_Forms");
      
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Admission_Forms_Filtered_${dateStr}.xlsx`;
      
      XLSX.writeFile(workbook, fileName);
    } catch (err: unknown) {
      console.error(err);
      alert('An error occurred during export.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      type="button" 
      onClick={handleExport} 
      disabled={loading}
      className="btn btn-secondary"
      style={{ 
        background: 'rgba(59, 130, 246, 0.1)', 
        color: '#60a5fa', 
        borderColor: 'rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}
    >
      {loading ? <><Loader size="sm" color="#60a5fa" /> Exporting...</> : 'Export'}
    </button>
  );
}
