export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--color-dim)' }}>
      {title} — 준비 중
    </div>
  );
}
