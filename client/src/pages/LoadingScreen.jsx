import { useEffect, useState } from 'react';

export default function LoadingScreen({ mode = 'full' }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setPct((p) => {
        const next = p + Math.max(1, Math.round(7 * Math.random()));
        return next >= 100 ? 100 : next;
      });
    }, 120);
    return () => clearInterval(t);
  }, []);

  if (mode === 'inline') {
    return (
      <div className="ver-mask">
        <div className="loading-screen" style={{ position: 'relative', width: '100%', height: '100%' }}>
          <Content pct={pct} />
        </div>
      </div>
    );
  }

  return (
    <div className="loading-screen">
      <Content pct={pct} />
    </div>
  );
}

function Content({ pct }) {
  return (
    <>
      <div className="loading-frame">
        <img src="/assets/loading.gif" alt="CODEBYTERS loading" decoding="async" width="640" height="700" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div className="loading-title">CODEX</div>
        <div className="loading-sub cursor-blink">system boot · codebyters</div>
      </div>
      <div className="loading-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="loading-pct">{String(pct).padStart(3, '0')}%</div>
    </>
  );
}
