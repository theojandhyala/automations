import type { CSSProperties } from 'react';

type ReactorStyle = CSSProperties & { '--reactor-size': string };

const REACTOR_COILS = Array.from({ length: 12 }, (_, index) => index);

export default function ArcReactorMark({
  size = 44,
  label = 'JARVIS arc reactor',
  className = '',
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`arc-reactor-mark ${className}`.trim()}
      style={{ '--reactor-size': `${size}px` } as ReactorStyle}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle className="arc-reactor-halo" cx="60" cy="60" r="52" />
        <circle className="arc-reactor-track" cx="60" cy="60" r="44" />
        <g className="arc-reactor-coils">
          {REACTOR_COILS.map((index) => (
            <path
              d="M57 10 L63 10 L65 24 L55 24 Z"
              transform={`rotate(${index * 30} 60 60)`}
              key={index}
            />
          ))}
        </g>
        <circle className="arc-reactor-inner-track" cx="60" cy="60" r="31" />
        <path className="arc-reactor-triangle outer" d="M60 34 L84 76 L36 76 Z" />
        <path className="arc-reactor-triangle inner" d="M60 44 L75 70 L45 70 Z" />
        <circle className="arc-reactor-core" cx="60" cy="60" r="9" />
        <circle className="arc-reactor-spark" cx="60" cy="60" r="3" />
      </svg>
    </span>
  );
}
