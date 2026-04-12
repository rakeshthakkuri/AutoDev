import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  pulsePhase: number;
};

export default function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c: HTMLCanvasElement = canvas;
    const r: CanvasRenderingContext2D = ctx;

    let frameId: number;
    const particles: Particle[] = [];
    const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      r.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      particles.length = 0;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w <= 0 || h <= 0) return;
      const count = isReducedMotion ? 20 : Math.min(120, Math.floor((w * h) / 18000));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          size: 1.2 + Math.random() * 2.2,
          opacity: 0.4 + Math.random() * 0.5,
          pulsePhase: Math.random() * Math.PI * 2,
        });
      }
    }

    function draw(time: number) {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w <= 0 || h <= 0) return;
      r.clearRect(0, 0, w, h);

      const pointer = pointerRef.current;

      for (const p of particles) {
        if (pointer) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const influence = Math.max(0, 2 - dist / 220);
          p.vx += (dx / dist) * influence * 0.06;
          p.vy += (dy / dist) * influence * 0.06;
        }
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -50) p.x = w + 50;
        if (p.x > w + 50) p.x = -50;
        if (p.y < -50) p.y = h + 50;
        if (p.y > h + 50) p.y = -50;

        const pulse = 1 + Math.sin(time * 0.001 + p.pulsePhase) * 0.15;
        const radius = p.size * 4 * pulse;

        const gradient = r.createRadialGradient(
          p.x, p.y, 0,
          p.x, p.y, radius
        );
        const hue = 240 + (p.pulsePhase / (Math.PI * 2)) * 40;
        gradient.addColorStop(0, `hsla(${hue}, 70%, 80%, ${0.45 * p.opacity})`);
        gradient.addColorStop(0.5, `hsla(${hue}, 60%, 70%, ${0.12 * p.opacity})`);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        r.fillStyle = gradient;
        r.beginPath();
        r.arc(p.x, p.y, radius, 0, Math.PI * 2);
        r.fill();
      }

      frameId = requestAnimationFrame(draw);
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect();
      pointerRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };
    const onPointerLeave = () => { pointerRef.current = null; };

    resize();
    seed();
    draw(0);

    const handleResize = () => { resize(); seed(); };
    window.addEventListener("resize", handleResize);
    c.addEventListener("pointermove", onPointerMove);
    c.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      c.removeEventListener("pointermove", onPointerMove);
      c.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-particles-canvas" aria-hidden />;
}
