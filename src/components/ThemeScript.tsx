// Inline script injected into <head> to read localStorage BEFORE first paint
// This prevents the flash-of-wrong-theme on page load
export default function ThemeScript() {
  const script = `
    (function() {
      try {
        var saved = localStorage.getItem('univmis-theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = saved || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      } catch(e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
