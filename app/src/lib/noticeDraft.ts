// noticeDraft.ts — 기사에게 보낼 공지 초안을 지금 화면의 판정 결과에서 그대로 만든다.
//
// 원칙: 없는 걸 지어내지 않는다. 세 덩어리 전부 이미 판정된 값(등급·발생률·구간 집계)만 옮긴다.
//   ① 단말 이상 차량 — 점검 요망
//   ② 단말은 정상인데 이벤트가 많은 차량 — 경고
//   ③ Heat-map 위험·주의 구간 — 구간명 + 조심할 점
// 새 등급이나 점수를 만들지 않는다(CLAUDE.md §1). ②의 기준은 등급이 아니라 "정상군 대비 배수"다.
import type { CorridorBundle, Vehicle } from '../types';
import { GRADE_META } from './grade';

/**
 * ②의 기준 — 절대 임계값이 아니라 상대 순위다(등급 판정과 같은 원칙).
 * 이벤트가 있는 정상 차량 중 발생률 상위 이 비율까지를 경고로 본다.
 * 절대 배수(중앙값 ×2 등)로 잡으면 0건 차량이 많은 달에는 아무도 안 걸리거나 전부 걸린다.
 */
const HEAVY_EVENT_TOP_RATIO = 0.2;
/** 공지는 읽히는 게 목적이다. 차량·구간 나열은 이 개수에서 끊고 나머지는 "외 N대"로 접는다. */
const MAX_LIST = 8;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function joinList(items: string[]): string {
  if (items.length <= MAX_LIST) return items.join(', ');
  return `${items.slice(0, MAX_LIST).join(', ')} 외 ${items.length - MAX_LIST}대`;
}

/** 우세 이벤트 유형별 주의사항 — 판정이 아니라 운전 조언이라 문장으로 둔다. */
const ADVICE_BY_TYPE: Record<string, string> = {
  급감속: '진입 전 미리 속도를 줄여 주세요',
  급정지: '앞차와 간격을 넓게 두세요',
  급가속: '출발 시 천천히 가속해 주세요',
  급출발: '정차 후 출발할 때 서두르지 마세요',
  과속: '제한속도를 확인해 주세요',
};

export type NoticeDraftParts = {
  text: string;
  deviceCheck: Vehicle[];
  heavyEvents: { vehicle: Vehicle; rate: number }[];
  segments: { routeName: string; label: string; kmFrom: number; kmTo: number; dominant: string | null }[];
  baselineRate: number;
};

export function buildNoticeDraft(vehicles: Vehicle[], corridor: CorridorBundle | null): NoticeDraftParts {
  // ① 단말 이상 — 등급이 정상이 아닌 차량. D(측정 불가)는 주행거리 0이라 점검 대상에 함께 둔다.
  const deviceCheck = vehicles
    .filter((v) => v.grade !== '정상')
    .sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id));

  // ② 단말은 정상인데 이벤트가 많은 차량 — 정상군 발생률 중앙값의 N배 이상.
  // 중앙값은 0건 차량을 빼고 낸다. 0건이 과반이면 중앙값이 0이 되고, 그러면 "0의 2배"라
  // 기준이 성립하지 않아 경고가 통째로 사라진다(실제로 승용 99대 때문에 그렇게 나왔다).
  const normals = vehicles.filter((v) => v.grade === '정상' && v.rate !== null);
  const withEvents = normals
    .map((v) => ({ vehicle: v, rate: (v.rate as number) * 100 }))
    .filter((x) => x.rate > 0)
    .sort((a, b) => b.rate - a.rate);
  // 비교 기준으로 보여줄 값 — 이벤트가 있는 정상 차량들의 중앙값(0건 차량은 뺀다).
  const baselineRate = median(withEvents.map((x) => x.rate));
  const heavyEvents = withEvents.slice(0, Math.max(1, Math.ceil(withEvents.length * HEAVY_EVENT_TOP_RATIO)));

  // ③ Heat-map 위험·주의 구간 — 전 구간 상대 순위 상위부터.
  const segments = (corridor?.routes ?? [])
    .flatMap((route) =>
      route.segments
        .filter((s) => s.tone !== 'ok')
        .map((s) => ({
          routeName: route.route_name,
          label: s.grade_label,
          kmFrom: s.km_from,
          kmTo: s.km_to,
          dominant: s.dominant_type,
          rank: s.rank_global,
        })),
    )
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_LIST);

  const lines: string[] = ['[S&E Driving 안전운행 안내]', ''];

  lines.push('■ 단말 점검 요망');
  if (deviceCheck.length === 0) {
    lines.push('- 해당 차량 없음');
  } else {
    lines.push(`- 대상 ${deviceCheck.length}대 — 단말 계측이 확인되지 않아 운행 기록이 남지 않습니다. 점검을 요청해 주세요.`);
    // 사유가 같은 차량끼리 묶는다 — 차량ID를 한 줄씩 늘어놓으면 아무도 안 읽는다.
    const byGrade = new Map<string, string[]>();
    for (const v of deviceCheck) {
      const label = GRADE_META[v.grade].label;
      if (!byGrade.has(label)) byGrade.set(label, []);
      byGrade.get(label)!.push(v.vehicle_id);
    }
    for (const [label, ids] of byGrade) lines.push(`  · ${label}: ${joinList(ids)}`);
  }
  lines.push('');

  lines.push('■ 위험운전 이벤트 경고');
  if (withEvents.length === 0) {
    lines.push('- 해당 차량 없음');
  } else {
    lines.push(
      `- 단말은 정상이나 이벤트가 많은 차량 ${heavyEvents.length}대 ` +
        `(이벤트가 있는 정상 차량 ${withEvents.length}대 중 발생률 상위 · 중간값 ${baselineRate.toFixed(1)}건/100km)`,
    );
    lines.push(`  · ${joinList(heavyEvents.map((x) => `${x.vehicle.vehicle_id}(${x.rate.toFixed(1)}건/100km)`))}`);
    lines.push('  · 급가속·급감속을 줄이면 사고 위험과 연료 소모가 함께 내려갑니다.');
  }
  lines.push('');

  lines.push('■ 위험구간 주의');
  if (segments.length === 0) {
    lines.push('- 집계된 위험구간 없음');
  } else {
    for (const s of segments) {
      const advice = s.dominant ? ADVICE_BY_TYPE[s.dominant] : null;
      lines.push(
        `- ${s.routeName} ${s.kmFrom}~${s.kmTo}km [${s.label}]` +
          (s.dominant ? ` · ${s.dominant} 위주` : '') +
          (advice ? ` — ${advice}` : ''),
      );
    }
  }

  return { text: lines.join('\n'), deviceCheck, heavyEvents, segments, baselineRate };
}
