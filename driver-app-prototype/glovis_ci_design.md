# HYUNDAI GLOVIS CI 디자인 가이드 (바이브코딩용)

> 출처: [현대글로비스 공식 홈페이지 — CI 소개](https://www.glovis.net/kr/home/company/ciintro)
> 공식 페이지에는 색상이 Pantone 코드로만 명시되어 있어, 실제 웹 렌더링 색상을 추출해 HEX/RGB를 병기함. 화면(웹/앱) 기준으로는 아래 HEX 값을 그대로 쓰면 되고, 인쇄물은 Pantone 기준으로 확인할 것.

---

## 1. 브랜드 개요

- **GLOVIS** = **Global** + **Vision** 합성어
- 의미: "세계화 시대에 새로운 비전을 제시하는 글로벌 서비스 기업"
- 현대글로비스 CI는 현대자동차그룹 'HYUNDAI' 브랜드와 언어적·시각적 체계를 연계하여, 그룹 소속감과 신뢰도를 나타내도록 현대자동차그룹 계열사 적용기준을 준수해 개발됨
- 디자인 키워드: **신뢰성, 전문성, 일관성** (전용 색상 설명 원문 기준)

## 2. 로고 / 심벌마크

- 구성: `HYUNDAI` + `GLOVIS` 워드마크 조합 (GLOVIS가 HYUNDAI BLUE로 강조되는 로고타입)
- **기본형**: HYUNDAI(상단, 소) + GLOVIS(하단, 대) 2단 조합
- **활용형**: `HYUNDAI GLOVIS` 1행 좌우 조합
- 심벌마크는 브랜드의 시각적 가치를 대표하므로 **절대 변형 금지** (색상·비율·형태 고정)
- 규정된 최소 독립 공간(Clear Space) 안으로 어떤 그래픽 요소도 침범 불가
- 활용 시 반드시 컴퓨터 파일(벡터 원본) 사용이 원칙, 불가능할 경우에만 Grid System으로 재작도

### 바이브코딩 시 로고 취급 원칙
- 로고를 CSS로 흉내 내거나 색을 바꿔 넣지 말 것 → 공식 로고 이미지를 그대로 쓰거나, 로고 없이 **색상 시스템·타이포 톤으로 CI를 녹여내는** 방식 권장
- 다크 배경 위에는 로고 가독성 문제가 생기므로 흰색 리버스 버전 필요 여부를 먼저 검토

## 3. 전용 색상 (Color Palette)

### 3-1. Main Color

| 명칭 | Pantone | HEX | RGB | 용도 |
|---|---|---|---|---|
| **HYUNDAI BLUE** | PANTONE 288C | `#000066` | rgb(0, 0, 102) | 브랜드 아이덴티티의 중심. 신뢰성·전문성 표현 |

### 3-2. Sub Color (보조색)

| 명칭 | Pantone | HEX | RGB |
|---|---|---|---|
| HYUNDAI LIGHT GRAY | PANTONE 420C | `#EEEEEE` | rgb(238, 238, 238) |
| HYUNDAI GRAY | PANTONE 421C | `#CCCCCC` | rgb(204, 204, 204) |
| HYUNDAI DARK-GRAY | PANTONE 425C | `#666666` | rgb(102, 102, 102) |
| HYUNDAI GOLD | PANTONE 872C | `#826434` | rgb(130, 100, 52) |
| HYUNDAI SILVER | PANTONE 877C | `#837B7A` | rgb(131, 123, 122) |

> **핵심 규칙**: 보조색은 주색(HYUNDAI BLUE)을 보조하는 차원에서만 사용. 보조색이 화면의 주인공이 되면 CI 위반 느낌이 남.

## 4. 활용 규정 (공식 페이지 요약)

1. 심벌마크 색상은 매체 불문 정확한 색상·명도·채도를 유지해 관리
2. 색상 기준은 Pantone Color이며 적용 아이템별 규정 준수
3. 색상 체계는 아이템에 따라 융통성을 갖되, 보조색은 항상 주색 보조 역할
4. Identity 사용 관련 의문사항은 현대글로비스 Identity 주관부서 문의

## 5. 코드 스니펫

### CSS Custom Properties

```css
:root {
  /* Main */
  --glovis-blue: #000066;

  /* Sub */
  --glovis-light-gray: #EEEEEE;
  --glovis-gray: #CCCCCC;
  --glovis-dark-gray: #666666;
  --glovis-gold: #826434;
  --glovis-silver: #837B7A;

  /* 파생 톤 (UI 실무용 — 공식 CI 아님, 블루 기반 확장) */
  --glovis-blue-hover: #1A1A80;   /* 버튼 hover */
  --glovis-blue-tint-10: #E6E6F0; /* 블루 10% 틴트 배경 */
  --glovis-white: #FFFFFF;
}
```

### Tailwind config

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        glovis: {
          blue: '#000066',
          'blue-hover': '#1A1A80',
          'light-gray': '#EEEEEE',
          gray: '#CCCCCC',
          'dark-gray': '#666666',
          gold: '#826434',
          silver: '#837B7A',
        },
      },
    },
  },
}
```

## 6. UI 적용 레시피 (공모전 앱 기준 제안)

| UI 요소 | 컬러 | 비고 |
|---|---|---|
| 헤더 / 내비게이션 바 | HYUNDAI BLUE `#000066` | 텍스트는 화이트 |
| Primary 버튼 / CTA | HYUNDAI BLUE | hover 시 `#1A1A80` |
| 본문 텍스트 | DARK-GRAY `#666666` ~ 블랙 | 제목은 진하게, 본문은 다크그레이 |
| 페이지/카드 배경 | 화이트 + LIGHT GRAY `#EEEEEE` 섹션 구분 | |
| 구분선 / disabled | GRAY `#CCCCCC` | |
| 성과·인증·프리미엄 뱃지 | GOLD `#826434` | 안전운전 인증서, 등급 뱃지 등에 적합 |
| 아이콘·메탈릭 포인트 | SILVER `#837B7A` | 과용 금지 |

접근성 참고: HYUNDAI BLUE(#000066)는 화이트 텍스트와 대비비가 매우 높아(WCAG AAA 수준) 버튼/헤더에 안전. 반대로 GOLD·SILVER 위 텍스트는 대비가 약하니 작은 글씨에는 쓰지 말 것.

## 7. 폰트

- CI 소개 페이지에는 전용 서체 규정이 **명시되어 있지 않음**
- 현대차그룹 계열사는 보통 그룹 전용서체(현대 하모니체 등)를 사용하는 관례가 있으므로, 공모전 주관 측에 전용 폰트 제공/사용 가능 여부 확인 권장
- 웹 데모에선 무난하게 Pretendard 또는 Noto Sans KR로 대체해도 CI 톤과 충돌 없음

## 8. 참고

- 공식 CI 소개: https://www.glovis.net/kr/home/company/ciintro
- 공모전 제출물에 로고·CI를 적용할 때는 최종 제출 전 주최 측 브랜드 가이드라인(제공 에셋 여부 포함) 확인 권장
