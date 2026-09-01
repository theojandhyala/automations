import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/supabase';
import type { App, Automation } from '../lib/types';
import ArcReactorMark from './ArcReactorMark';

export interface AutomationHandler {
  key: string;
  name: string;
  description: string;
}

interface ParameterRow {
  id: number;
  key: string;
  value: string;
}

interface ForgeDraft {
  name: string;
  handlerKey: string;
  appReference: string;
  cron: string;
  mandate: string;
  successCriteria: string;
  guardrails: string;
  icon: string;
  accent: string;
  enabled: boolean;
}

export type ProtocolForgeMode = 'create' | 'edit' | 'clone';

const EMPTY_DRAFT: ForgeDraft = {
  name: '',
  handlerKey: '',
  appReference: '',
  cron: '',
  mandate: '',
  successCriteria: '',
  guardrails: '',
  icon: 'gear',
  accent: '#63e7ff',
  enabled: false,
};

const DIRECTIVE_KEYS = new Set(['operator_directives', 'success_criteria', 'guardrails']);

function draftFromAutomation(automation: Automation | null, mode: ProtocolForgeMode): ForgeDraft {
  if (!automation) return EMPTY_DRAFT;
  return {
    name: mode === 'clone' ? `${automation.name} // COPY` : automation.name,
    handlerKey: automation.handler_key,
    appReference: automation.app_id ?? '',
    cron: automation.cron ?? '',
    mandate: String(automation.config.operator_directives ?? automation.description ?? ''),
    successCriteria: String(automation.config.success_criteria ?? ''),
    guardrails: String(automation.config.guardrails ?? ''),
    icon: automation.icon || 'gear',
    accent: automation.accent ?? '#63e7ff',
    enabled: mode === 'edit' ? automation.enabled : false,
  };
}

function parameterRows(automation: Automation | null): ParameterRow[] {
  if (!automation) return [{ id: 1, key: '', value: '' }];
  const rows = Object.entries(automation.config)
    .filter(([key]) => !DIRECTIVE_KEYS.has(key))
    .map(([key, value], index) => ({
      id: index + 1,
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
  return rows.length ? rows : [{ id: 1, key: '', value: '' }];
}

function coerceValue(raw: string): unknown {
  const value = raw.trim();
  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      return raw;
    }
  }
  return raw;
}

function compileConfig(draft: ForgeDraft, parameters: ParameterRow[]): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const row of parameters) {
    const key = row.key.trim();
    if (key) config[key] = coerceValue(row.value);
  }
  if (draft.mandate.trim()) config.operator_directives = draft.mandate.trim();
  if (draft.successCriteria.trim()) config.success_criteria = draft.successCriteria.trim();
  if (draft.guardrails.trim()) config.guardrails = draft.guardrails.trim();
  return config;
}

export default function ProtocolForge({
  apps,
  handlers,
  preview,
  mode,
  automation,
  onClose,
  onSaved,
}: {
  apps: App[];
  handlers: AutomationHandler[];
  preview: boolean;
  mode: ProtocolForgeMode;
  automation: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialParameters = useRef(parameterRows(automation));
  const [draft, setDraft] = useState<ForgeDraft>(() => draftFromAutomation(automation, mode));
  const [parameters, setParameters] = useState<ParameterRow[]>(initialParameters.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const nextParameterId = useRef(initialParameters.current.length + 1);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nameInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const appQuery = draft.appReference.trim().toLowerCase();
  const matchingApp = appQuery
    ? apps.find((candidate) => [candidate.id, candidate.slug, candidate.name].some((value) => value.toLowerCase() === appQuery))
    : undefined;
  const config = compileConfig(draft, parameters);
  if (matchingApp && ['tiktok.generate', 'tiktok.produce'].includes(draft.handlerKey.trim()) && !config.app_slug) {
    config.app_slug = matchingApp.slug;
  }
  const matchingHandler = handlers.find((handler) => handler.key.toLowerCase() === draft.handlerKey.trim().toLowerCase());
  const editing = mode === 'edit';
  const operationLabel = editing ? 'RECALIBRATE PROTOCOL' : mode === 'clone' ? 'COMPILE REPLICA' : 'COMPILE PROTOCOL';

  function setField<K extends keyof ForgeDraft>(key: K, value: ForgeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateParameter(id: number, field: 'key' | 'value', value: string) {
    setParameters((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  function addParameter() {
    const id = nextParameterId.current++;
    setParameters((current) => [...current, { id, key: '', value: '' }]);
  }

  function removeParameter(id: number) {
    setParameters((current) => current.length === 1
      ? [{ ...current[0]!, key: '', value: '' }]
      : current.filter((row) => row.id !== id));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const name = draft.name.trim();
    const handlerKey = draft.handlerKey.trim();
    if (!name || !handlerKey) {
      setError('Protocol name and executable capability key are required.');
      return;
    }

    if (appQuery && !matchingApp) {
      setError('App binding was not recognised. Use the exact app name, slug, or ID shown in the mission registry.');
      return;
    }

    setBusy(true);
    try {
      if (!preview) {
        const shared = {
          name,
          description: draft.mandate.trim().slice(0, 500) || null,
          app_id: matchingApp?.id ?? null,
          cron: draft.cron.trim() || null,
          enabled: draft.enabled,
          config,
          icon: draft.icon.trim() || 'gear',
          accent: draft.accent,
        };
        if (editing && automation) {
          await api(`/automations/${automation.id}`, {
            method: 'PATCH',
            body: JSON.stringify(shared),
          });
        } else {
          await api('/automations', {
            method: 'POST',
            body: JSON.stringify({
              handler_key: handlerKey,
              ...shared,
              kind: matchingApp ? 'app' : 'system',
            }),
          });
        }
        onSaved();
      }
      setSuccess(preview
        ? `Preview ${editing ? 'recalibration' : 'protocol'} compiled. No live automation was changed.`
        : editing ? `${name} recalibrated across the automation mesh.` : `${name} compiled into the automation mesh.`);
      if (!editing) {
        setDraft(EMPTY_DRAFT);
        setParameters([{ id: nextParameterId.current++, key: '', value: '' }]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="forge-scrim" type="button" aria-label="Close protocol forge" onClick={onClose} />
      <section className="protocol-forge" role="dialog" aria-modal="true" aria-labelledby="forge-title">
        <header className="forge-head">
          <div className="forge-identity">
            <ArcReactorMark size={54} />
            <div><span>J.A.R.V.I.S. // MARK IX</span><h2 id="forge-title">{editing ? 'PROTOCOL CALIBRATOR' : mode === 'clone' ? 'REPLICATION FORGE' : 'PROTOCOL FORGE'}</h2><p>{editing ? 'Reconfigure live automation authority without losing its execution history.' : mode === 'clone' ? 'Fork a proven protocol into a new, safely paused automation.' : 'Compile an operator-defined automation into the live command mesh.'}</p></div>
          </div>
          <div className="forge-head-state"><i /><span>{editing ? 'LIVE EDIT MODE' : mode === 'clone' ? 'SAFE REPLICA MODE' : 'FREE-INPUT MODE'}</span><b>VALIDATION ARMED</b></div>
          <button type="button" className="forge-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="forge-body">
          <aside className="forge-blueprint">
            <div className="forge-reactor-map" aria-hidden="true"><i /><i /><i /><b /></div>
            <span className="forge-kicker">AUTOMATION BLUEPRINT</span>
            <h3>{draft.name.trim() || 'UNNAMED PROTOCOL'}</h3>
            <p>{draft.mandate.trim() || 'Awaiting an operator-defined mission mandate.'}</p>
            <dl>
              <div><dt>ENGINE</dt><dd>{draft.handlerKey.trim() || 'UNBOUND'}</dd></div>
              <div><dt>MISSION</dt><dd>{draft.appReference.trim() || 'SYSTEM WIDE'}</dd></div>
              <div><dt>TRIGGER</dt><dd>{draft.cron.trim() || 'MANUAL'}</dd></div>
              <div><dt>STATE</dt><dd>{draft.enabled ? 'ARMED' : 'SAFE / PAUSED'}</dd></div>
            </dl>
            <div className="forge-sequence" aria-hidden="true">
              {['INTENT', 'TRIGGER', 'INPUTS', 'GUARDS', 'OUTPUT'].map((label, index) => <span key={label}><i className={index < 4 ? 'ready' : ''} />{label}</span>)}
            </div>
            <div className="capability-registry">
              <span>LIVE EXECUTABLE REGISTRY</span>
              {handlers.map((handler) => <code key={handler.key}>{handler.key}</code>)}
              <small>Type a capability key yourself. JARVIS verifies it against the runtime when you compile.</small>
            </div>
          </aside>

          <form className="forge-form" onSubmit={submit}>
            <section className="forge-section">
              <div className="forge-section-title"><i>01</i><span><b>IDENTITY & AUTHORITY</b><small>Name the protocol and bind its executable core.</small></span></div>
              <div className="forge-grid two">
                <label><span>Protocol name</span><input ref={nameInputRef} value={draft.name} maxLength={120} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Morning intelligence sweep" /></label>
                <label><span>Capability key</span><input value={draft.handlerKey} disabled={editing} onChange={(event) => setField('handlerKey', event.target.value)} placeholder="Type an executable handler key" /><small>{editing ? 'Runtime engines are immutable after creation. Clone this protocol to change capability.' : matchingHandler?.description ?? 'Free input — validated against the live runtime.'}</small></label>
                <label><span>App or mission binding</span><input value={draft.appReference} onChange={(event) => setField('appReference', event.target.value)} placeholder="Name, slug, ID, or leave system-wide" /><small>Registry: {apps.map((app) => app.name).join(' · ') || 'No app missions linked'}</small></label>
                <label><span>Visual identity</span><div className="forge-inline"><input value={draft.icon} maxLength={32} onChange={(event) => setField('icon', event.target.value)} placeholder="Icon key" /><input className="forge-color" type="color" value={draft.accent} onChange={(event) => setField('accent', event.target.value)} aria-label="Protocol accent color" /></div></label>
              </div>
            </section>

            <section className="forge-section">
              <div className="forge-section-title"><i>02</i><span><b>OPERATOR DIRECTIVE</b><small>Describe the outcome in your own words. Nothing is preselected.</small></span></div>
              <label><span>Mission mandate</span><textarea value={draft.mandate} maxLength={5000} onChange={(event) => setField('mandate', event.target.value)} placeholder="Tell JARVIS exactly what this automation should accomplish, what context it should use, and how it should behave…" /></label>
              <div className="forge-grid two">
                <label><span>Success definition</span><textarea value={draft.successCriteria} maxLength={3000} onChange={(event) => setField('successCriteria', event.target.value)} placeholder="What must be true for the run to count as successful?" /></label>
                <label><span>Safety and approval rules</span><textarea value={draft.guardrails} maxLength={3000} onChange={(event) => setField('guardrails', event.target.value)} placeholder="What must it never do? What requires your approval?" /></label>
              </div>
            </section>

            <section className="forge-section">
              <div className="forge-section-title"><i>03</i><span><b>TRIGGER & PARAMETERS</b><small>Use a five-field cron expression or leave blank for manual command.</small></span></div>
              <div className="forge-grid schedule">
                <label><span>Trigger expression</span><input className="mono" value={draft.cron} onChange={(event) => setField('cron', event.target.value)} placeholder="e.g. 0 8 * * 1-5" /></label>
                <label className="forge-switch"><input type="checkbox" checked={draft.enabled} onChange={(event) => setField('enabled', event.target.checked)} /><i /><span><b>Arm after compilation</b><small>Off is safer: the protocol is created paused.</small></span></label>
              </div>
              <div className="parameter-head"><span>CUSTOM CONFIGURATION MATRIX</span><button type="button" onClick={addParameter}>+ ADD PARAMETER</button></div>
              <div className="parameter-list">
                {parameters.map((row, index) => (
                  <div className="parameter-row" key={row.id}>
                    <i>P-{String(index + 1).padStart(2, '0')}</i>
                    <input value={row.key} onChange={(event) => updateParameter(row.id, 'key', event.target.value)} placeholder="parameter_key" aria-label={`Parameter ${index + 1} key`} />
                    <input value={row.value} onChange={(event) => updateParameter(row.id, 'value', event.target.value)} placeholder="value, number, boolean, array, or JSON" aria-label={`Parameter ${index + 1} value`} />
                    <button type="button" onClick={() => removeParameter(row.id)} aria-label={`Remove parameter ${index + 1}`}>×</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="forge-section forge-output">
              <div className="forge-section-title"><i>04</i><span><b>COMPILED CONFIGURATION</b><small>Typed values are inferred automatically before secure validation.</small></span></div>
              <pre>{JSON.stringify(config, null, 2)}</pre>
            </section>

            {error ? <div className="forge-message error" role="alert"><b>COMPILATION FAULT</b><span>{error}</span></div> : null}
            {success ? <div className="forge-message success" role="status"><b>PROTOCOL ACCEPTED</b><span>{success}</span></div> : null}

            <footer className="forge-actions">
              <button type="button" onClick={onClose}>CANCEL</button>
              <div><span>{draft.enabled ? 'ARMED ON SAVE' : editing ? 'SAVES PAUSED' : 'CREATES IN SAFE MODE'}</span><button className="forge-compile" type="submit" disabled={busy}>{busy ? 'COMPILING…' : operationLabel}</button></div>
            </footer>
          </form>
        </div>
      </section>
    </>
  );
}
