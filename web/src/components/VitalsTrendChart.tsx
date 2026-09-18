interface Point {
  x: string; // label (time)
  y: number;
}

function buildPath(points: Point[], width: number, height: number, min: number, max: number): string {
  if (points.length === 0) return '';
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = points.length > 1 ? i * step : width / 2;
      const y = height - ((p.y - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function VitalsTrendChart({ label, points, unit }: { label: string; points: Point[]; unit: string }) {
  if (points.length === 0) return null;

  const width = 280;
  const height = 60;
  const values = points.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const path = buildPath(points, width, height, min, max);
  const last = points[points.length - 1];

  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-teal">
          {last.y}
          {unit}
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="#0B6259" strokeWidth={2} />
        {points.map((p, i) => {
          const step = points.length > 1 ? width / (points.length - 1) : 0;
          const x = points.length > 1 ? i * step : width / 2;
          const range = max - min || 1;
          const y = height - ((p.y - min) / range) * height;
          return <circle key={i} cx={x} cy={y} r={2.5} fill="#C8922A" />;
        })}
      </svg>
    </div>
  );
}
