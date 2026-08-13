// serveDataPlugin.mjs — /data/*.json 을 디스크에서 매 요청마다 직접 읽어 내려준다.
//
// 왜 Vite 기본 public/ 서빙을 안 쓰는가:
// 빌드 스크립트가 실행 중에 public/data/*.json 을 지웠다가 다시 만든다(업로드 반영·초기화).
// Vite dev 서버는 파일 감시자로 public/ 목록을 캐싱하는데, 감시자를 끄면(=full-reload 방지)
// 재생성된 파일을 영영 못 찾아 SPA fallback(HTML)을 대신 돌려준다 — Safe 화면에서 차량 목록이
// 통째로 안 뜨는 원인이었다. 감시자를 켜면 이번엔 쓸 때마다 브라우저가 강제 새로고침된다.
// 그래서 이 경로만 감시자와 무관하게 직접 서빙한다(항상 최신, 캐시 없음).
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');

export function serveDataPlugin() {
  return {
    name: 'serve-data-dir',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const urlPath = (req.url ?? '').split('?')[0];
        if (!urlPath.endsWith('.json')) return next();

        // 경로 탈출 방지 — /data 밖으로 못 나가게 한다.
        const filePath = normalize(join(DATA_DIR, urlPath));
        if (!filePath.startsWith(DATA_DIR)) return next();
        if (!existsSync(filePath)) return next();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(filePath));
      });
    },
  };
}
