export default function MaintenancePage({ message }) {
  return (
    <div className="loading-screen">
      <div className="loading-frame">
        <img src="/assets/loading.gif" alt="CODEBYTERS maintenance" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div className="loading-title">CODEX</div>
        <div className="loading-sub">maintenance in progress</div>
      </div>
      <p className="maintenance-msg">
        {message || 'We are improving the system. Please check back in a little while.'}
      </p>
    </div>
  );
}