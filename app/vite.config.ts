import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mapSchemaPlugin } from './scripts/mapSchemaPlugin.mjs'
import { ingestCommitPlugin } from './scripts/ingestCommitPlugin.mjs'
import { serveDataPlugin } from './scripts/serveDataPlugin.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Vite의 loadEnv는 실제 OS 환경변수를 .env 파일보다 우선한다. 이 머신에는 이미 다른(만료/무권한)
  // GEMINI_API_KEY가 시스템 환경변수로 박혀 있어서, .env.local에 새로 넣은 키가 조용히 무시되고
  // Gemini가 401(ACCESS_TOKEN_TYPE_UNSUPPORTED)을 던지는 원인이 됐다. .env.local 값을 명시적으로
  // 최우선으로 강제한다.
  try {
    const local = readFileSync('.env.local', 'utf-8')
    const match = local.match(/^GEMINI_API_KEY=(.*)$/m)
    if (match) env.GEMINI_API_KEY = match[1].trim()
  } catch {
    // .env.local 없으면 loadEnv 결과(있다면 시스템 환경변수) 그대로 둔다.
  }

  return {
    plugins: [react(), tailwindcss(), serveDataPlugin(), mapSchemaPlugin(env), ingestCommitPlugin()],
    // Vite dev 서버는 프로젝트 안 파일이 바뀌면(모듈 그래프 밖이라도) 브라우저를 통째로 새로고침한다.
    // ingest-commit이 매 "확인" 클릭마다 public/data/*.json과 files2/*.csv를 쓰므로 둘 다 감시에서 뺀다
    // — 안 그러면 "확인 눌렀더니 로그인 화면으로 돌아간다"가 난다.
    // 감시를 끄면 Vite가 재생성된 public/data 파일을 못 찾으므로, 그 경로는 serveDataPlugin이 직접 서빙한다.
    server: {
      watch: {
        ignored: ['**/public/data/**', '**/files2/**'],
      },
    },
  }
})
