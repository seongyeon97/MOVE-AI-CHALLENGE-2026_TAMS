// mapSchemaPlugin.mjs — 트랙9 서버 미들웨어. Gemini API 키를 브라우저 번들에 절대 넣지 않으려고
// Vite dev 서버 미들웨어로 둔다(POST /api/map-schema). attempts:1, timeout:30000, SDK 재시도 없음.
// 프로덕션 배포 시엔 이 라우트를 대체할 실제 서버가 필요하다 — 지금은 npm run dev 데모 전제.

const SYSTEM_PROMPT = `너는 이기종 운행데이터 CSV를 표준 스키마에 매핑하는 도구다. 반드시 아래 7규칙을 따른다.
1. 헤더 행 위치를 직접 탐지하라 — 1행이라고 가정하지 마라.
2. 헤더명과 표본값을 모두 근거로 매핑하라.
3. 단위 변환 필요 여부는 표본값의 크기로 판단하라(예: km vs m).
4. 오타·약어는 문맥으로 해석하되 source_name은 원문 그대로 보존하라.
5. 대응되는 표준필드가 없으면 standard_key를 null로 두고 unmapped로 처리하라.
6. 결측된 표준필드는 하류영향(missing_impact)을 반드시 명시하라.
7. reasoning은 한국어 한 줄 + confidence(low/medium/high)로 낸다.
반드시 강제된 JSON 스키마로만 응답하라.`;

function buildResponseSchema(standardKeys) {
  return {
    type: 'OBJECT',
    properties: {
      header_row_index: { type: 'NUMBER' },
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
    required: ['header_row_index', 'mappings', 'unmapped_standard_fields'],
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

        const userPrompt = [
          `표준 스키마: ${body.standardKeys.join(', ')}`,
          `CSV 원본 앞부분(행 배열, 헤더 위치 미정):`,
          JSON.stringify(body.rawRows),
        ].join('\n');

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          const res2 = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
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
