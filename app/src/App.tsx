import { useState } from 'react';
import type { Role, Screen } from './types';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { SafeScreen } from './components/SafeScreen';
import { CertificateScreen } from './components/CertificateScreen';
import { EcoScreen } from './components/EcoScreen';
import { IngestScreen } from './components/IngestScreen';
import { IntegrityCompareScreen } from './components/IntegrityCompareScreen';
import { Placeholder } from './components/Placeholder';
import { useAnyOpenDeviceRequest } from './lib/deviceRequests';

// 상단 메뉴바·빵조각·홈 화면 없음. 진입점은 좌측 메뉴 하나뿐(§CLAUDE.md 1절).
function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [screen, setScreen] = useState<Screen>('safe');

  if (role === null) {
    return <LoginScreen onLogin={(r) => setRole(r)} />;
  }

  if (role === 'driver') {
    return <Placeholder title="기사뷰" />; // 트랙10
  }

  return <CompanyShell screen={screen} setScreen={setScreen} setRole={setRole} />;
}

function CompanyShell({
  screen,
  setScreen,
  setRole,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  setRole: (r: Role) => void;
}) {
  const hasUnreadSafeAlert = useAnyOpenDeviceRequest();

  return (
    <div className="flex h-full" style={{ background: 'var(--color-ink)' }}>
      <Sidebar
        active={screen}
        onNavigate={setScreen}
        onSwitchToDriver={() => setRole('driver')}
        hasUnreadSafeAlert={hasUnreadSafeAlert}
      />
      <main className="flex-1 overflow-auto">
        {screen === 'safe' && <SafeScreen onOpenIngest={() => setScreen('ingest')} />}
        {screen === 'eco' && <EcoScreen />}
        {screen === 'heatmap' && <Placeholder title="Heat-map" />}
        {screen === 'certificate' && <CertificateScreen />}
        {screen === 'settings' && <Placeholder title="설정" />}
        {screen === 'ingest' && <IngestScreen onBack={() => setScreen('safe')} onOpenIntegrityDemo={() => setScreen('integrity-demo')} />}
        {screen === 'integrity-demo' && <IntegrityCompareScreen />}
      </main>
    </div>
  );
}

export default App;
