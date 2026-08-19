import Loader from '@/components/Loader';

export default function Loading() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
      flexDirection: 'column',
      gap: '1rem',
      color: 'var(--text-muted)'
    }}>
      <Loader size="lg" color="var(--primary-color)" />
      <p style={{ fontWeight: 500 }}>Loading...</p>
    </div>
  );
}
