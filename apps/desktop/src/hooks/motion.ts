import { useEffect, useState } from "react";
import { useApp } from "../stores/app";
export function useReducedMotion() {
  const preference = useApp((s) => s.settings.reducedMotion);
  const [system, setSystem] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystem(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return preference || system;
}
