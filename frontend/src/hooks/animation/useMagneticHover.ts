import { useEffect, useRef } from "react";

export function useMagneticHover<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current as T | null;
    if (!element) return;

    let frame: number | null = null;

    const rect = () => element.getBoundingClientRect();

    function handlePointerMove(event: PointerEvent) {
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = null;
          const r = rect();
          if (!r) return;
          const x = event.clientX - (r.left + r.width / 2);
          const y = event.clientY - (r.top + r.height / 2);
          const distance = Math.sqrt(x * x + y * y);
          const strength = Math.max(0, 1 - distance / 260);
          const translateX = x * 0.18 * strength;
          const translateY = y * 0.18 * strength;
          element!.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`;
        });
      }
    }

    function handlePointerLeave() {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      element!.style.transform = "translate3d(0, 0, 0)";
    }

    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerleave", handlePointerLeave);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return ref;
}
