// mapSchemaPlugin.mjs — 트랙9 서버 미들웨어. Gemini API 키를 브라우저 번들에 절대 넣지 않으려고
// Vite dev 서버 미들웨어로 둔다(POST /api/map-schema). attempts:1, timeout:30000, SDK 재시도 없음.
// 프로덕션 배포 시엔 이 라우트를 대체할 실제 서버가 필요하다 — 지금은 npm run dev 데모 전제.
//
// 실제 업로드 파일로 확인된 것 — 첫 시트가 "개요"(설명 텍스트)뿐인 멀티시트 워크북, 그리고
// "차량 1행 + 월별 반복 컬럼" 와이드(피벗) 포맷. 그래서 이 미들웨어가 하는 일은 컬럼명 매핑뿐 아니라
// ① 여러 시트 중 실제 데이터 시트 선택 ② 와이드 포맷이면 반복 컬럼그룹을 찾아 롱포맷 리셰이프 계획까지 낸다.

const SYSTEM_PROMPT = `너는 이기종 운행·유류 데이터 워크북을 표준 스키마에 매핑하는 도구다. 반드시 아래 규칙을 따른다.
1. 워크북에 시트가 여러 개면, 표(행/열 데이터)가 실제로 있는 시트를 골라라. "개요"·설명·범례처럼 서술형 텍스트만 있는 시트는 고르지 마라.
2. 헤더 행 위치를 직접 탐지하라 — 1행이라고 가정하지 마라.
3. 한 행이 "차량 1대(또는 개체 1개)"를 나타내고, 같은 성격의 값이 "2026년 3월 운행거리", "2026년 4월 운행거리"처럼 기간별로 반복되는 컬럼 그룹이 있으면 layout을 wide_by_period로 판단하라. 그 외 행마다 독립된 레코드 하나면 long이다.
4. wide_by_period면: 반복되지 않는 식별 컬럼(예: 차량번호, 차종)을 id_columns로, 반복 구간마다의 컬럼들을 period_groups로 낸다. 같은 역할(예: 주행거리 vs 유류사용량)의 컬럼에는 시점이 달라도 같은 field_role 문자열을 써라 — 가능하면 표준 스키마 키(vehicle_id, odo_km, fuel_l 등)를 field_role로 직접 써라.
5. long이면: mappings 배열에 원본 컬럼명마다 표준필드를 매핑하라. 헤더명과 표본값을 모두 근거로 삼아라. 단위 변환 필요 여부는 표본값의 크기로 판단하라. 오타·약어는 문맥으로 해석하되 source_name은 원문 그대로 보존하라. 대응되는 표준필드가 없으면 standard_key를 unmapped로 둬라.
6. 결측된 표준필드는 하류영향(missing_impact)을 반드시 명시하라.
7. reasoning은 한국어 한 줄 + confidence(low/medium/high)로 낸다.
반드시 강제된 JSON 스키마로만 응답하라. wide_by_period일 때 mappings는 빈 배열로, long일 때 id_columns·period_groups는 빈 배열로 둬라.`;

function buildResponseSchema(standardKeys) {
  return {
    type: 'OBJECT',
    properties: {
      target_sheet_index: { type: 'NUMBER' },
      header_row_index: { type: 'NUMBER' },
      layout: { type: 'STRING', enum: ['long', 'wide_by_period'] },
      id_columns: { type: 'ARRAY', items: { type: 'STRING' } },
      period_groups: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            period_label: { type: 'STRING' },
            fields: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: { source_name: { type: 'STRING' }, field_role: { type: 'STRING' } },
                required: ['source_name', 'field_role'],
              },
            },
          },
          required: ['period_label', 'fields'],
        },
      },
      mappings: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            source_name: { type: 'STRING' },
            standard_key: { type: 'STRING', enum: [...standardKeys, 'unmapped'] },
            unit_conversion: { type: 'STRING' },
            reasoning: { type: 'STRING' },
            confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
          },
          required: ['source_name', 'standard_key', 'reasoning', 'confidence'],
        },
      },
      unmapped_standard_fields: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { key: { type: 'STRING' }, missing_impact: { type: 'STRING' } },
          required: ['key', 'missing_impact'],
        },
      },
    },
    required: ['target_sheet_index', 'header_row_index', 'layout', 'id_columns', 'period_groups', 'mappings', 'unmapped_standard_fields'],
  };
}

export function mapSchemaPlugin(env) {
  return {
    name: 'map-schema-middleware',
    configureServer(server) {
      server.middlewares.use('/api/map-schema', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

        const key = env.GEMINI_API_KEY;
        if (!key) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'no_api_key' }));
          return;
        }

        const sheetsDescription = body.sheets
          .map((s, i) => `[시트 ${i}] 이름="${s.name}" 총 ${s.rowCount}행\n${JSON.stringify(s.rawRows)}`)
          .join('\n\n');
        const userPrompt = [
          `표준 스키마 키 목록: ${body.standardKeys.join(', ')}`,
          `워크북 시트 목록과 각 시트 앞부분(행 배열):`,
          sheetsDescription,
        ].join('\n');

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          const res2 = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
            {
              method: 'POST',
              signal: controller.signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ parts: [{ text: userPrompt }] }],
                generationConfig: { responseMimeType: 'application/json', responseSchema: buildResponseSchema(body.standardKeys) },
              }),
            },
          );
          clearTimeout(timeout);
          if (!res2.ok) throw new Error(`gemini ${res2.status}`);
          const json = await res2.json();
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error('empty response');

          res.setHeader('Content-Type', 'application/json');
          res.end(text);
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'llm_failed', message: String(err) }));
        }
      });
    },
  };
}
