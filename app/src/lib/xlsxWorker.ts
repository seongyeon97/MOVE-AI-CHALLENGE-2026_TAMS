// xlsxWorker.ts — xlsx 파싱을 메인 스레드 밖에서 한다. 86,896행짜리 실제 파일 기준 8~10초 걸린다 —
// 메인 스레드에서 그대로 돌리면 그동안 탭이 완전히 멈춘 것처럼 보인다(실제로 멈춘 것도 맞다).
/// <reference lib="webworker" />

self.onmessage = async (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(e.data.buffer, { type: 'array' });
  const sheets = wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: '', raw: false }) as unknown as string[][];
    return { name, rows: rows.map((r) => r.map((c) => String(c ?? ''))) };
  });
  (self as unknown as Worker).postMessage({ sheets });
};
