export default function Loader({ size = 'md', color = 'var(--primary-color)' }: { size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const sizeMap = {
    sm: '16px',
    md: '24px',
    lg: '32px'
  };

  const borderWidth = {
    sm: '2px',
    md: '3px',
    lg: '4px'
  };

  const currentSize = sizeMap[size];
  const currentBorder = borderWidth[size];

  return (
    <div
      style={{
        display: 'inline-block',
        width: currentSize,
        height: currentSize,
        border: `${currentBorder} solid rgba(255,255,255,0.3)`,
        borderTop: `${currentBorder} solid ${color}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}
      className="loader"
    />
  );
}
