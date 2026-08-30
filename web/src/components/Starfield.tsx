import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number; // depth 0..1; drives size, brightness and parallax
  tw: number; // twinkle phase
}

/**
 * Canvas star field with depth parallax against the pointer. Drawn on a canvas
 * rather than as DOM nodes so a few hundred stars cost one paint.
 *
 * Honours prefers-reduced-motion by not mounting an animation loop at all --
 * the CSS also hides the canvas, but there is no reason to burn a rAF either.
 */
export default function Starfield({ count = 220 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    const pointer = { x: 0, y: 0 };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        tw: Math.random() * Math.PI * 2,
      }));
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, width, height);
      for (const s of stars) {
        // Nearer stars (higher z) shift further with the pointer.
        const px = s.x + pointer.x * (4 + s.z * 22);
        const py = s.y + pointer.y * (4 + s.z * 22);
        const twinkle = reduced ? 1 : 0.62 + 0.38 * Math.sin(t / 900 + s.tw);
        const radius = 0.35 + s.z * 1.25;

        ctx!.globalAlpha = (0.16 + s.z * 0.66) * twinkle;
        ctx!.fillStyle = s.z > 0.82 ? '#a5f3fc' : '#e2e8f0';
        ctx!.beginPath();
        ctx!.arc(px, py, radius, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    let frame = 0;
    function loop(t: number) {
      draw(t);
      frame = requestAnimationFrame(loop);
    }

    function onPointer(e: PointerEvent) {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }

    resize();
    window.addEventListener('resize', resize);

    if (reduced) {
      draw(0);
    } else {
      window.addEventListener('pointermove', onPointer, { passive: true });
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [count]);

  return <canvas className="starfield" ref={ref} aria-hidden="true" />;
}
