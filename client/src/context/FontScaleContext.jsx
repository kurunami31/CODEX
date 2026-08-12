import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const FontScaleContext = createContext(null);
const KEY = 'codex_text_scale';

export const TEXT_SCALES = [
  { id: 'small', label: 'A−', name: 'Small', value: 0.875 },
  { id: 'normal', label: 'A', name: 'Normal', value: 1 },
  { id: 'large', label: 'A+', name: 'Large', value: 1.125 },
];

const DEFAULT_ID = 'normal';

function getInitial() {
  try {
    const id = localStorage.getItem(KEY);
    return TEXT_SCALES.some((s) => s.id === id) ? id : DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
}

export function FontScaleProvider({ children }) {
  const [scaleId, setScaleId] = useState(getInitial);

  const scale = TEXT_SCALES.find((s) => s.id === scaleId) || TEXT_SCALES[1];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(scale.value));
    try {
      localStorage.setItem(KEY, scaleId);
    } catch {
      /* storage unavailable — still applies for this session */
    }
  }, [scaleId, scale.value]);

  const setScale = useCallback((id) => {
    if (TEXT_SCALES.some((s) => s.id === id)) setScaleId(id);
  }, []);

  return (
    <FontScaleContext.Provider value={{ scaleId, scale, setScale }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScale() {
  return useContext(FontScaleContext);
}
