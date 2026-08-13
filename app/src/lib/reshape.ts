// reshape.ts — 와이드(피벗) 포맷을 롱포맷으로 펼친다. 실제 유류사용량 파일이 "차량당 1행 + 월별 반복 컬럼"
// 구조였다 — 표준 스키마 매핑은 롱포맷(행=시점 1건)을 전제하므로, 매핑 전에 이 변환이 먼저 필요하다.
// 어떤 컬럼이 반복그룹인지는 LLM이 판단한다(mapSchemaPlugin) — 여기는 그 계획을 실행만 한다.

export type PeriodGroup = {
  period_label: string;
  fields: { source_name: string; field_role: string }[];
};

export type WideByPeriodPlan = {
  header_row_index: number;
  id_columns: string[];
  period_groups: PeriodGroup[];
};

export type ReshapeResult = { header: string[]; rows: string[][] };

const PERIOD_COLUMN_LABEL = '기간';

export function unpivotWideByPeriod(sheetRows: string[][], plan: WideByPeriodPlan): ReshapeResult {
  const header = sheetRows[plan.header_row_index] ?? [];
  const dataRows = sheetRows.slice(plan.header_row_index + 1).filter((r) => r.some((c) => c !== ''));

  const idIndexes = plan.id_columns.map((c) => header.indexOf(c));
  const fieldRoles = [...new Set(plan.period_groups.flatMap((g) => g.fields.map((f) => f.field_role)))];
  const outHeader = [...plan.id_columns, PERIOD_COLUMN_LABEL, ...fieldRoles];

  const outRows: string[][] = [];
  for (const row of dataRows) {
    const idVals = idIndexes.map((i) => row[i] ?? '');
    for (const group of plan.period_groups) {
      const roleVals = fieldRoles.map((role) => {
        const field = group.fields.find((f) => f.field_role === role);
        if (!field) return '';
        const idx = header.indexOf(field.source_name);
        return idx >= 0 ? (row[idx] ?? '') : '';
      });
      outRows.push([...idVals, group.period_label, ...roleVals]);
    }
  }

  return { header: outHeader, rows: outRows };
}
