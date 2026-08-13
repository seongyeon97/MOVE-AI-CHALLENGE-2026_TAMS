import { useState } from 'react';
import type { Role, Screen } from './types';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { SafeScreen } from './components/SafeScreen';
import { CertificateScreen } from './components/CertificateScreen';
import { EcoScreen } from './components/EcoScreen';
import { Placeholder } from './components/Placeholder';

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

  return (
    <div className="flex h-full" style={{ background: 'var(--color-ink)' }}>
      <Sidebar
        active={screen}
        onNavigate={setScreen}
        onSwitchToDriver={() => setRole('driver')}
        hasUnreadSafeAlert={false} // 트랙11(공지·단말점검)이 실제 값으로 채운다.
      />
      <main className="flex-1 overflow-auto">
        {screen === 'safe' && <SafeScreen />}
        {screen === 'eco' && <EcoScreen />}
        {screen === 'heatmap' && <Placeholder title="Heat-map" />}
        {screen === 'certificate' && <CertificateScreen />}
        {screen === 'settings' && <Placeholder title="설정" />}
      </main>
    </div>
  );
}

export default App;
