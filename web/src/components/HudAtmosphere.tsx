import { useEffect, useRef } from 'react';
import Starfield from './Starfield';

const DATA_COLUMNS = [
  '010011 110101 001101 101110',
  'SYS.048 / CORE-LINK / 99.8',
  '110010 001011 111000 010101',
  'ARC BUS 07 // SYNCHRONIZED',
  '011101 101011 001110 110001',
  'NEURAL MESH // PATH 4A.12',
];

/**
 * Decorative systems layer for the command deck. Pointer movement is written
 * straight to CSS custom properties so the holographic parallax never causes
 * a React render loop.
 */
export default function HudAtmosphere() {
  const atmosphereRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = atmosphereRef.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;

    const paint = () => {
      node.style.setProperty('--pointer-x', targetX.toFixed(3));
      node.style.setProperty('--pointer-y', targetY.toFixed(3));
      frame = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth - 0.5) * 2;
      targetY = (event.clientY / window.innerHeight - 0.5) * 2;
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <div className="hud-atmosphere" ref={atmosphereRef} aria-hidden="true">
      <Starfield count={150} />
      <div className="hud-vignette" />
      <div className="hud-horizon">
        <i className="latitude l1" />
        <i className="latitude l2" />
        <i className="longitude g1" />
        <i className="longitude g2" />
      </div>
      <div className="hud-sweep" />
      <div className="data-stream left-stream">
        {DATA_COLUMNS.slice(0, 3).map((value) => <span key={value}>{value}</span>)}
      </div>
      <div className="data-stream right-stream">
        {DATA_COLUMNS.slice(3).map((value) => <span key={value}>{value}</span>)}
      </div>
      <div className="target-reticle target-a"><i /><b /></div>
      <div className="target-reticle target-b"><i /><b /></div>
      <div className="target-reticle target-c"><i /><b /></div>
      <div className="edge-scale edge-scale-left">
        {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
      </div>
      <div className="edge-scale edge-scale-right">
        {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
      </div>
      <div className="boot-sequence">
        <div className="boot-reactor"><i /><i /><i /></div>
        <strong>MARK // COMMAND INTELLIGENCE</strong>
        <span>INITIALIZING HOLOGRAPHIC WORKSPACE</span>
        <b><i /></b>
      </div>
    </div>
  );
}
