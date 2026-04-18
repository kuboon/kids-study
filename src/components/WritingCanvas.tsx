import { useEffect, useRef, useState } from 'preact/hooks';

type Stroke = { points: { x: number; y: number; p: number }[]; color: string; width: number };

export type WritingCanvasProps = {
  /** The character or word to display as guide. */
  guide: string;
  /** 1=trace, 2=faint guide, 3=guide beside, 4=blank. */
  level: 1 | 2 | 3 | 4;
  /** Kids stylus color */
  color?: string;
  onAnyStroke?: () => void;
};

export function WritingCanvas({ guide, level, color = '#e74e82', onAnyStroke }: WritingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);

  const box = 600;

  function toLocal(e: PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * box;
    const y = ((e.clientY - rect.top) / rect.height) * box;
    return { x, y };
  }

  function onDown(e: PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toLocal(e);
    const stroke: Stroke = {
      points: [{ x, y, p: e.pressure || 0.5 }],
      color,
      width: 8 + (e.pressure || 0.5) * 8,
    };
    setCurrent(stroke);
  }

  function onMove(e: PointerEvent) {
    if (!current) return;
    e.preventDefault();
    const { x, y } = toLocal(e);
    setCurrent({
      ...current,
      points: [...current.points, { x, y, p: e.pressure || 0.5 }],
    });
  }

  function onUp() {
    if (!current) return;
    setStrokes((s) => [...s, current]);
    setCurrent(null);
    onAnyStroke?.();
  }

  function clear() {
    setStrokes([]);
    setCurrent(null);
  }

  function undo() {
    setStrokes((s) => s.slice(0, -1));
  }

  useEffect(() => {
    clear();
  }, [guide]);

  const guideOpacity = level === 1 ? 0.35 : level === 2 ? 0.15 : 0;
  const showSideGuide = level === 3;
  const fontSize = Math.min(box * 0.82, 500);

  return (
    <div class="writing-wrap">
      {showSideGuide && (
        <div class="writing-side-guide" aria-hidden="true">
          <span>{guide}</span>
        </div>
      )}
      <svg
        ref={svgRef}
        class="writing-canvas"
        viewBox={`0 0 ${box} ${box}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      >
        <defs>
          <pattern id="grid" width={box / 2} height={box / 2} patternUnits="userSpaceOnUse">
            <path
              d={`M ${box / 2} 0 L 0 0 0 ${box / 2}`}
              fill="none"
              stroke="#ffd3e0"
              stroke-dasharray="6 8"
              stroke-width="2"
            />
          </pattern>
        </defs>
        <rect width={box} height={box} fill="#fffafc" />
        <rect width={box} height={box} fill="url(#grid)" />
        <line x1={box / 2} y1="0" x2={box / 2} y2={box} stroke="#ffd3e0" stroke-dasharray="4 8" />
        <line x1="0" y1={box / 2} x2={box} y2={box / 2} stroke="#ffd3e0" stroke-dasharray="4 8" />

        {guideOpacity > 0 && (
          <text
            x={box / 2}
            y={box / 2}
            text-anchor="middle"
            dominant-baseline="central"
            font-size={fontSize}
            font-family="'Hiragino Maru Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif"
            font-weight="800"
            fill={`rgba(74, 42, 56, ${guideOpacity})`}
          >
            {guide}
          </text>
        )}

        {[...strokes, ...(current ? [current] : [])].map((s, i) => (
          <polyline
            key={i}
            points={s.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={s.color}
            stroke-width={s.width}
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        ))}
      </svg>

      <div class="writing-tools">
        <button class="btn" onClick={undo} disabled={strokes.length === 0}>
          ← もどす
        </button>
        <button class="btn" onClick={clear} disabled={strokes.length === 0}>
          けす
        </button>
      </div>
    </div>
  );
}
