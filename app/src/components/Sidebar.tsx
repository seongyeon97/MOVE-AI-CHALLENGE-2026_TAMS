import type { Screen } from '../types';

const MENU: { screen: Screen; label: string; hint: string }[] = [
  { screen: 'safe', label: 'Safe', hint: '안전운전 진단·검증 + 차량 관리' },
  { screen: 'eco', label: 'Eco', hint: '연비 기반 탄소 관리' },
  { screen: 'heatmap', label: 'Heat-map', hint: '구간 위험도' },
  { screen: 'certificate', label: 'S&E 증명서 발급', hint: '대외 제출 문서' },
];

type SidebarProps = {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  onSwitchToDriver: () => void;
  hasUnreadSafeAlert: boolean; // 트랙11(공지·단말점검)이 실제 값으로 채운다.
};

export function Sidebar({ active, onNavigate, onSwitchToDriver, hasUnreadSafeAlert }: SidebarProps) {
  return (
    <nav className="flex h-full w-56 flex-col border-r px-3 py-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}>
      <div className="px-2 pb-6 text-sm font-semibold tracking-wide" style={{ color: 'var(--color-chalk)' }}>
        S&E Driving Platform
      </div>

      <ul className="flex flex-col gap-1">
        {MENU.map((item) => {
          const isActive = active === item.screen;
          return (
            <li key={item.screen}>
              <button
                type="button"
                onClick={() => onNavigate(item.screen)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors"
                style={{
                  color: isActive ? 'var(--color-paper)' : 'var(--color-mist)',
                  background: isActive ? 'var(--color-panel-2)' : 'transparent',
                }}
              >
                <span>{item.label}</span>
                {item.screen === 'safe' && hasUnreadSafeAlert && (
                  <span className="tone-dead-rail h-1.5 w-1.5 rounded-full" aria-label="미확인 알림" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="my-3 border-t" style={{ borderColor: 'var(--color-rule)' }} />

      <button
        type="button"
        onClick={() => onNavigate('settings')}
        className="rounded-md px-3 py-2 text-left text-sm"
        style={{
          color: active === 'settings' ? 'var(--color-paper)' : 'var(--color-mist)',
          background: active === 'settings' ? 'var(--color-panel-2)' : 'transparent',
        }}
      >
        ⚙ 설정
      </button>

      <div className="my-3 border-t" style={{ borderColor: 'var(--color-rule)' }} />

      <button
        type="button"
        onClick={onSwitchToDriver}
        className="rounded-md px-3 py-2 text-left text-sm"
        style={{ color: 'var(--color-dim)' }}
      >
        ↔ 기사뷰로
      </button>
    </nav>
  );
}
