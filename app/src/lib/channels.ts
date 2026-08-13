// channels.ts — 공지·단말점검 채널명 상수. v1에서 문자열 불일치로 공지가 안 뜬 버그가 있었다.
// notices.ts·deviceRequests.ts·Safe·기사뷰 전부 이 상수만 쓴다 — 문자열 리터럴 직접 쓰지 않는다.
export const ALL_VEHICLES = 'ALL' as const;
