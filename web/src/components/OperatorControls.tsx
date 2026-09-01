import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface OperatorPreferences {
  motion: boolean;
  audio: boolean;
  density: boolean;
  reticles: boolean;
  intensity: number;
}

const STORAGE_KEY = 'jarvis.operator.v1';
const DEFAULT_PREFERENCES: OperatorPreferences = {
  motion: true,
  audio: false,
  density: false,
  reticles: true,
  intensity: 92,
};

function readPreferences(): OperatorPreferences {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } as OperatorPreferences;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function Toggle({
  checked,
  label,
  detail,
  onChange,
}: {
  checked: boolean;
  label: string;
  detail: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="operator-toggle">
      <span><b>{label}</b><small>{detail}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true"><b /></i>
    </label>
  );
}

export default function OperatorControls({
  attention,
  active,
  connected,
  protocols,
}: {
  attention: number;
  active: number;
  connected: number;
  protocols: number;
}) {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<OperatorPreferences>(readPreferences);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.jarvisMotion = preferences.motion ? 'cinematic' : 'still';
    root.dataset.jarvisDensity = preferences.density ? 'high' : 'standard';
    root.dataset.jarvisReticles = preferences.reticles ? 'visible' : 'hidden';
    root.style.setProperty('--jarvis-intensity', String(preferences.intensity / 100));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (!preferences.audio) return undefined;

    const onPress = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('button, a, input[type="checkbox"], input[type="range"]')) return;
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(720, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1180, context.currentTime + 0.045);
      gain.gain.setValueAtTime(0.018, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.07);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.075);
    };

    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
  }, [preferences.audio]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (!editing && event.key.toLowerCase() === 'h' && !event.metaKey && !event.ctrlKey && !event.altKey) setOpen(true);
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const update = <Key extends keyof OperatorPreferences>(key: Key, value: OperatorPreferences[Key]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const panel = open ? createPortal(
    <div className="operator-layer">
      <button className="operator-scrim" type="button" aria-label="Close operator controls" onClick={() => setOpen(false)} />
      <aside className="operator-panel" role="dialog" aria-modal="true" aria-label="Operator interface controls">
        <header>
          <div className="operator-mini-reactor" aria-hidden="true"><i /><i /><b /></div>
          <div><span>J.A.R.V.I.S. // OWNER AUTHORITY</span><h3>OPERATOR THRONE</h3><p>Shape the command environment around the way you work.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close operator controls">×</button>
        </header>

        <div className="operator-vitals" aria-label="Live system totals">
          <span><small>ACTIVE</small><b>{active}</b></span>
          <span><small>PROTOCOLS</small><b>{protocols}</b></span>
          <span><small>UPLINKS</small><b>{connected}</b></span>
          <span className={attention ? 'attention' : ''}><small>ATTENTION</small><b>{attention}</b></span>
        </div>

        <section className="operator-section">
          <div className="operator-section-title"><span>01</span><div><b>HOLOGRAPHIC ENVIRONMENT</b><small>Persistent on this device</small></div></div>
          <Toggle checked={preferences.motion} label="Cinematic motion" detail="Orbital sweeps, scans and reactor movement" onChange={(value) => update('motion', value)} />
          <Toggle checked={preferences.reticles} label="Peripheral targeting" detail="Edge scales, telemetry and tracking reticles" onChange={(value) => update('reticles', value)} />
          <label className="operator-range">
            <span><b>Hologram intensity</b><small>{preferences.intensity}% luminance</small></span>
            <input type="range" min="45" max="100" value={preferences.intensity} onChange={(event) => update('intensity', Number(event.target.value))} />
          </label>
        </section>

        <section className="operator-section">
          <div className="operator-section-title"><span>02</span><div><b>TACTICAL RESPONSE</b><small>Interface behaviour</small></div></div>
          <Toggle checked={preferences.audio} label="Tactile audio" detail="Subtle synthesized confirmation tones" onChange={(value) => update('audio', value)} />
          <Toggle checked={preferences.density} label="Command density" detail="Compress telemetry for maximum field awareness" onChange={(value) => update('density', value)} />
        </section>

        <footer>
          <span><i /> OWNER PROFILE SYNCHRONIZED</span>
          <button type="button" onClick={() => setPreferences(DEFAULT_PREFERENCES)}>RESTORE MARK VII</button>
        </footer>
      </aside>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button className="operator-launch" type="button" onClick={() => setOpen(true)} aria-label="Open operator interface controls">
        <span className="operator-launch-core"><i /></span>
        <span><small>OWNER INTERFACE</small><b>HUD CONTROL</b></span>
        <kbd>H</kbd>
      </button>
      {panel}
    </>
  );
}
