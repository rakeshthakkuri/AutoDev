import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";

const CURSOR_SIZE = 22;
const CURSOR_SIZE_HOVER = 48;
const RIPPLE_SIZE = 60;

type CursorState = "default" | "hover" | "click";

export default function CustomCursor() {
  const [smoothed, setSmoothed] = useState({ x: -100, y: -100 });
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<CursorState>("default");
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const rafRef = useRef<number>();
  const smoothRef = useRef({ x: -100, y: -100 });
  const positionRef = useRef({ x: -100, y: -100 });

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      positionRef.current = { x: e.clientX, y: e.clientY };
      if (!visible) setVisible(true);
    };

    const handleLeave = () => setVisible(false);

    const handleDown = () => {
      setMode("click");
      const { x, y } = positionRef.current;
      setRipples((prev) => [...prev.slice(-2), { id: Date.now(), x, y }]);
    };

    const handleUp = () => setMode("default");

    const handleOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.closest?.("button") ||
        target?.closest?.("a") ||
        target?.closest?.("[data-cursor-hover]")
      ) {
        setMode("hover");
      }
    };

    const handleOut = () => setMode("default");

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerleave", handleLeave);
    window.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("mouseover", handleOver);
    window.addEventListener("mouseout", handleOut);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerleave", handleLeave);
      window.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("mouseover", handleOver);
      window.removeEventListener("mouseout", handleOut);
    };
  }, [visible]);

  useEffect(() => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const step = () => {
      const pos = positionRef.current;
      smoothRef.current = {
        x: lerp(smoothRef.current.x, pos.x, 0.18),
        y: lerp(smoothRef.current.y, pos.y, 0.18),
      };
      setSmoothed({ ...smoothRef.current });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (ripples.length === 0) return;
    const t = setTimeout(() => setRipples((p) => p.slice(0, -1)), 600);
    return () => clearTimeout(t);
  }, [ripples.length]);

  if (typeof window === "undefined") return null;

  const size = mode === "hover" ? CURSOR_SIZE_HOVER : CURSOR_SIZE;

  return (
    <>
      <motion.div
        className="cursor-blob"
        style={{
          left: smoothed.x,
          top: smoothed.y,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          opacity: visible ? 1 : 0,
        }}
        animate={{
          scale: mode === "click" ? 0.88 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      />
      {ripples.map((r) => (
        <motion.div
          key={r.id}
          className="cursor-ripple"
          style={{
            left: r.x,
            top: r.y,
            marginLeft: -RIPPLE_SIZE / 2,
            marginTop: -RIPPLE_SIZE / 2,
          }}
          initial={{ width: 0, height: 0, opacity: 0.6 }}
          animate={{ width: RIPPLE_SIZE, height: RIPPLE_SIZE, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </>
  );
}
