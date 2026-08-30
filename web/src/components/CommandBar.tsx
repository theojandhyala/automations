import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/supabase';
import type { Account, App, Automation } from '../lib/types';

/**
 * Natural-language command bar.
 *
 * It maps phrasing onto actions the control plane can actually perform -- run
 * an agent, pause one, open a page. It is deliberately NOT a chatbot: there is
 * no model behind it, and when a request falls outside what it can do it says
 * so plainly rather than replying with something agreeable and doing nothing.
 *
 * "Make a video about X" is the interesting case: the pipeline cannot make
 * videos yet, so it queues concepts and says exactly that.
 */
interface Reply {
  text: string;
  tone: 'ok' | 'warn';
}

interface RecognitionResultLike {
  readonly 0: { transcript: string };
}

interface RecognitionEventLike {
  results: { readonly 0: RecognitionResultLike };
}

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => RecognitionLike;

export default function CommandBar({
  automations,
  apps,
  accounts,
  drafts,
  onOpenAgent,
  onChanged,
}: {
  automations: Automation[];
  apps: App[];
  accounts: Account[];
  drafts: number;
  onOpenAgent: (automation: Automation) => void;
  onChanged: () => void;
}) {
  const [value, setValue] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [shutdownArmed, setShutdownArmed] = useState(false);
  const [publishArmed, setPublishArmed] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const navigate = useNavigate();

  const recognitionConstructor = typeof window === 'undefined'
    ? undefined
    : ((window as typeof window & {
        SpeechRecognition?: RecognitionConstructor;
        webkitSpeechRecognition?: RecognitionConstructor;
      }).SpeechRecognition
      ?? (window as typeof window & { webkitSpeechRecognition?: RecognitionConstructor })
        .webkitSpeechRecognition);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.key === '/' && !isTyping) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape') setReply(null);
    }
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    if (!shutdownArmed && !publishArmed) return undefined;
    const timeout = window.setTimeout(() => {
      setShutdownArmed(false);
      setPublishArmed(null);
    }, 12_000);
    return () => window.clearTimeout(timeout);
  }, [publishArmed, shutdownArmed]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function findApp(text: string): App | undefined {
    return apps.find((a) => text.includes(a.slug) || text.includes(a.name.toLowerCase()));
  }

  function findAutomation(text: string): Automation | undefined {
    // Longest name first, so "Draft concepts — Cast" beats a bare "cast".
    const exact = [...automations]
      .sort((a, b) => b.name.length - a.name.length)
      .find((a) => text.includes(a.name.toLowerCase()) || text.includes(a.handler_key));
    if (exact) return exact;

    const app = findApp(text);
    const candidates = app ? automations.filter((automation) => automation.app_id === app.id) : automations;
    const aliases: Array<[RegExp, string]> = [
      [/draft|concept|idea|creative|content/, 'tiktok.generate'],
      [/publish|post|upload/, 'tiktok.publish'],
      [/reconcile|in[- ]flight|settle/, 'tiktok.reconcile'],
      [/analytics|stats|performance|numbers/, 'analytics.sync'],
      [/report|briefing|morning/, 'report.daily'],
      [/audit|pipeline/, 'pipeline.audit'],
      [/heartbeat|health/, 'system.heartbeat'],
    ];
    const alias = aliases.find(([pattern]) => pattern.test(text));
    if (alias) return candidates.find((automation) => automation.handler_key === alias[1]);
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  function describeAgent(agent: Automation): string {
    const app = apps.find((candidate) => candidate.id === agent.app_id);
    const state = agent.status === 'running'
      ? `working on ${agent.current_task ?? 'its current mission'}`
      : agent.enabled
        ? 'online and waiting for its next mission'
        : 'paused';
    const mission = agent.description?.replace(/\.$/, '') ?? 'No mission description is configured';
    return `${agent.name} is the ${app?.name ?? 'system'} agent for: ${mission}. It is ${state}.`;
  }

  function speak(text: string) {
    if (!voiceReplies || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/@/g, 'at '));
    utterance.rate = 1.02;
    utterance.pitch = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  async function run(text: string): Promise<Reply> {
    const t = text
      .toLowerCase()
      .trim()
      .replace(/^jarvis[,:]?\s*/, '')
      .replace(/^please\s+/, '')
      .replace(/^(can|could|would) you\s+/, '');

    if (/^(status|system status|give me (a )?status|how are things)$/.test(t)) {
      const running = automations.filter((automation) => automation.status === 'running').length;
      const attention = automations.filter(
        (automation) => automation.status === 'failed' || automation.status === 'disabled',
      ).length;
      const connected = accounts.filter((account) => account.status === 'connected').length;
      return {
        text: attention
          ? `${attention} agent${attention === 1 ? '' : 's'} need attention. ${running} active, ${drafts} creations waiting, ${connected} publishing accounts linked.`
          : `All systems nominal. ${running} active, ${drafts} creations waiting, ${connected} publishing accounts linked.`,
        tone: attention ? 'warn' : 'ok',
      };
    }

    if (/what agents|list agents|show agents|agent roster|who is online/.test(t)) {
      const appAgents = apps
        .map((app) => `${app.name}: ${automations.filter((automation) => automation.app_id === app.id).map((automation) => automation.name).join(', ') || 'none'}`)
        .join(' · ');
      const systemCount = automations.filter((automation) => !automation.app_id).length;
      return { text: `${appAgents} · ${systemCount} system agents. Click any stone or ask me to open one.`, tone: 'ok' };
    }

    if (/what does|tell me about|explain|mission of/.test(t)) {
      const agent = findAutomation(t);
      if (!agent) return { text: 'Name the agent you want me to explain.', tone: 'warn' };
      return { text: describeAgent(agent), tone: agent.status === 'failed' ? 'warn' : 'ok' };
    }

    if (/status (of|for)|how is|is .* (online|running|working)/.test(t)) {
      const agent = findAutomation(t);
      if (!agent) return { text: 'I could not match that to an agent.', tone: 'warn' };
      return { text: describeAgent(agent), tone: agent.status === 'failed' ? 'warn' : 'ok' };
    }

    if (/^(open|show|inspect|view)\b/.test(t)) {
      const agent = findAutomation(t);
      if (agent) {
        onOpenAgent(agent);
        return { text: `Opened ${agent.name}. Its mission, controls, health, logs and outputs are ready.`, tone: 'ok' };
      }
    }

    if (/what('s| is) (next|scheduled)|next mission/.test(t)) {
      const next = automations
        .filter((automation) => automation.enabled && automation.next_run_at)
        .sort((a, b) => (a.next_run_at ?? '').localeCompare(b.next_run_at ?? ''))[0];
      if (!next?.next_run_at) return { text: 'No scheduled mission is queued.', tone: 'warn' };
      return {
        text: `${next.name} is next at ${new Date(next.next_run_at).toLocaleString()}.`,
        tone: 'ok',
      };
    }

    if (/what needs attention|diagnose|check system/.test(t)) {
      const attention = automations.filter(
        (automation) => automation.status === 'failed' || automation.status === 'disabled',
      );
      const accountProblem = accounts.find((account) => account.status !== 'connected');
      if (attention.length) return { text: `${attention[0].name} needs attention. Open its stone for details.`, tone: 'warn' };
      if (accountProblem) return { text: `Publishing for @${accountProblem.handle} still needs connection attention.`, tone: 'warn' };
      if (drafts) return { text: `${drafts} creation${drafts === 1 ? '' : 's'} are ready for review.`, tone: 'ok' };
      return { text: 'Nothing needs attention. All configured systems are nominal.', tone: 'ok' };
    }

    if (/^(home|overview|open overview|show overview)$/.test(t)) {
      navigate('/');
      return { text: 'Opened the system overview.', tone: 'ok' };
    }

    if (/(^|\s)(queue|review|drafts?)(\s|$)/.test(t) && !/run|start/.test(t)) {
      navigate('/queue');
      return { text: 'Opened the review queue.', tone: 'ok' };
    }
    if (/report/.test(t) && !/run|start|trigger|go|status|explain/.test(t)) {
      navigate('/reports');
      return { text: 'Opened reports.', tone: 'ok' };
    }
    if (/account|connect/.test(t) && !/run|start|trigger|go|promote|campaign/.test(t)) {
      navigate('/accounts');
      return { text: 'Opened accounts.', tone: 'ok' };
    }

    if (/promote|promotion mission|campaign/.test(t) && !/status|explain/.test(t)) {
      const app = findApp(t);
      navigate(app ? `/promote?app=${encodeURIComponent(app.slug)}` : '/promote');
      return { text: 'Opened Promotion Mission. Choose the outcome and I will route the work through the right agents.', tone: 'ok' };
    }

    if (/confirm (stop|pause|shutdown) (everything|all)|confirm shutdown/.test(t) && shutdownArmed) {
      await api('/kill', { method: 'POST' });
      setShutdownArmed(false);
      onChanged();
      return { text: 'Every automation is paused.', tone: 'warn' };
    }

    if (/stop (everything|all)|kill|panic|shutdown/.test(t)) {
      setShutdownArmed(true);
      return { text: 'System-wide pause armed for 12 seconds. Confirm to pause every automation.', tone: 'warn' };
    }

    // Direct creation requests enter the guided mission instead of silently
    // launching an underspecified scheduled agent configuration.
    if (/make|create|film|shoot/.test(t) && /video|clip|post|short/.test(t)) {
      const app = findApp(t);
      navigate(app ? `/promote?app=${encodeURIComponent(app.slug)}` : '/promote');
      return {
        text: 'Opened Promotion Mission so you can choose the app, audience, outcome and exact creative route before any agents run.',
        tone: 'ok',
      };
    }

    if (/^(run|start|trigger|go)\b/.test(t)) {
      const agent = findAutomation(t);
      if (!agent) return { text: 'No agent matched that name.', tone: 'warn' };
      if (agent.status === 'running') return { text: `${agent.name} is already working.`, tone: 'warn' };
      if (agent.handler_key === 'tiktok.publish' && publishArmed !== agent.id) {
        setPublishArmed(agent.id);
        return {
          text: `${agent.name} can publish approved content externally. Say “confirm run ${agent.name}” within 12 seconds to proceed.`,
          tone: 'warn',
        };
      }
      await api(`/automations/${agent.id}/run`, { method: 'POST' });
      setPublishArmed(null);
      onChanged();
      return { text: `${agent.name} is running.`, tone: 'ok' };
    }

    if (/^confirm run\b/.test(t)) {
      const agent = findAutomation(t);
      if (!agent || publishArmed !== agent.id) return { text: 'No publishing mission is awaiting confirmation.', tone: 'warn' };
      await api(`/automations/${agent.id}/run`, { method: 'POST' });
      setPublishArmed(null);
      onChanged();
      return { text: `${agent.name} is running with your confirmation.`, tone: 'ok' };
    }

    if (/^(pause|stop|disable)\b/.test(t)) {
      const agent = findAutomation(t);
      if (!agent) return { text: 'No agent matched that name.', tone: 'warn' };
      await api(`/automations/${agent.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
      onChanged();
      return { text: `${agent.name} is paused.`, tone: 'ok' };
    }

    if (/^(enable|resume|unpause)\b/.test(t)) {
      const agent = findAutomation(t);
      if (!agent) return { text: 'No agent matched that name.', tone: 'warn' };
      await api(`/automations/${agent.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
      onChanged();
      return { text: `${agent.name} is enabled.`, tone: 'ok' };
    }

    return {
      text:
        'Not something I can do. Try "run analytics sync", "pause morning report", ' +
        '"make a video about Deadset", "show the queue", or "stop everything".',
      tone: 'warn',
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const nextReply = await run(value);
      setReply(nextReply);
      speak(nextReply.text);
      setValue('');
    } catch (err) {
      setReply({ text: err instanceof Error ? err.message : String(err), tone: 'warn' });
    } finally {
      setBusy(false);
    }
  }

  function toggleVoice() {
    if (!recognitionConstructor) {
      setReply({ text: 'Voice control is not supported by this browser. Typed commands still work locally.', tone: 'warn' });
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new recognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-GB';
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setValue(transcript);
      inputRef.current?.focus();
    };
    recognition.onerror = () => {
      setReply({ text: 'I could not hear that command. Try again or type it.', tone: 'warn' });
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function quick(text: string) {
    setBusy(true);
    try {
      const nextReply = await run(text);
      setReply(nextReply);
      speak(nextReply.text);
    } catch (err) {
      setReply({ text: err instanceof Error ? err.message : String(err), tone: 'warn' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="command-bar">
      <div className="command-label">
        <span><i /> JARVIS command</span>
        <span className="command-label-tools">
          <button
            type="button"
            className={voiceReplies ? 'active' : ''}
            onClick={() => setVoiceReplies((enabled) => !enabled)}
            aria-pressed={voiceReplies}
          >
            Voice replies {voiceReplies ? 'on' : 'off'}
          </button>
          <kbd>⌘ K</kbd>
        </span>
      </div>
      {reply && (
        <div className={`command-reply ${reply.tone === 'warn' ? 'warn' : ''}`} role="status">
          <b>JARVIS</b>
          <span>{reply.text}</span>
        </div>
      )}
      <form onSubmit={submit}>
        <button
          className={`voice-command ${listening ? 'listening' : ''}`}
          type="button"
          onClick={toggleVoice}
          aria-label={listening ? 'Stop listening' : 'Speak a command'}
          title={recognitionConstructor ? 'Speak a command' : 'Voice input is not supported in this browser'}
        >
          <span aria-hidden="true">{listening ? '◉' : '◌'}</span>
        </button>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={listening ? 'Listening…' : 'Ask JARVIS for status, run an agent, or open a mission…'}
          aria-label="Command JARVIS"
          disabled={busy}
        />
        <button className="primary" type="submit" disabled={busy || !value.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
      <div className="quick-actions">
        <button onClick={() => quick('system status')}>System status</button>
        <button onClick={() => quick('list agents')}>Agent roster</button>
        <button onClick={() => quick('what needs attention')}>Diagnose</button>
        <button onClick={() => quick('show the queue')}>Review queue</button>
        <button onClick={() => quick('run analytics sync')}>Sync analytics</button>
        <button onClick={() => quick('run morning report')}>Build report</button>
        <button
          className={shutdownArmed ? 'danger armed' : 'danger'}
          onClick={() => quick(shutdownArmed ? 'confirm stop everything' : 'stop everything')}
        >
          {shutdownArmed ? 'Confirm pause all' : 'Pause all'}
        </button>
      </div>
    </div>
  );
}
