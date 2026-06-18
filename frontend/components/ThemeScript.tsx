export function ThemeScript() {
  const code = `
    (function() {
      try {
        var stored = localStorage.getItem('centnarr-theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = stored || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
        if (!stored) {
          try { localStorage.setItem('centnarr-theme', theme); } catch (e) {}
        }
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}