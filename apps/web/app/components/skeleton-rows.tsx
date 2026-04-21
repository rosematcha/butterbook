'use client';

export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-paper-100">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-3 animate-pulse rounded bg-paper-200"
                style={{ width: `${40 + ((i * 17 + j * 23) % 50)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-paper-200 ${className}`} />;
}
