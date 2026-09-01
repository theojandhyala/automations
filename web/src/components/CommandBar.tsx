import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

interface PromotionFeature {
  key: string;
  label: string;
  uploaded: boolean;
}

interface PromotionAppReadiness {
  id: string;
  slug: string;
  name: string;
  content_domain: 'fitness' | 'fishing';
  drafting_ready: boolean;
  producer_available: boolean;
  photo_source_ready: boolean;
  blockers: string[];
}

interface PromotionReadiness {
  apps: PromotionAppReadiness[];
  feature_libraries: Record<string, PromotionFeature[]>;
}

const COUNT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
};

function commandCount(text: string): number {
  const numeric = text.match(/\b([1-6])\b/);
  if (numeric) return Number(numeric[1]);
  const word = Object.entries(COUNT_WORDS).find(([candidate]) => text.includes(candidate));
  return word?.[1] ?? 3;
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
  onOpenForge,
  onSetMode,
  onChanged,
}: {
  automations: Automation[];
  apps: App[];
  accounts: Account[];
  drafts: number;
  onOpenAgent: (automation: Automation) => void;
  onOpenForge: () => void;
  onSetMode: (mode: 'missions' | 'protocols' | 'signals' | 'operations') => void;
  onChanged: () => void;
}) {
  const [value, setValue] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [shutdownArmed, setShutdownArmed] = useState(false);
  const [publishArmed, setPublishArmed] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
        setExpanded(true);
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (event.key === 'Escape') {
        setExpanded(false);
        setReply(null);
      }
    }
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

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
      [/produce|render|build (final )?slides/, 'tiktok.produce'],
      [/publish|post|upload/, 'tiktok.publish'],
      [/reconcile|in[- ]flight|settle/, 'tiktok.reconcile'],
    ];
    const alias = aliases.find(([pattern]) => pattern.test(text));
    if (alias) {
      return candidates.find((automation) => automation.handler_key === alias[1])
        ?? automations.find((automation) => automation.handler_key === alias[1] && !automation.app_id);
    }
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
      const attention = automations.filter((automation) => automation.status === 'failed').length
        + accounts.filter((account) => account.status !== 'connected').length;
      const connected = accounts.filter((account) => account.status === 'connected').length;
      return {
        text: attention
          ? `${attention} agent${attention === 1 ? '' : 's'} need attention. ${running} active, ${drafts} creations waiting, ${connected} publishing accounts linked.`
          : `All systems nominal. ${running} active, ${drafts} creations waiting, ${connected} publishing accounts linked.`,
        tone: attention ? 'warn' : 'ok',
      };
    }

    if (/what agents|list agents|show agents|agent roster|who is online/.test(t)) {
      return { text: 'Three missions only: Deadset promotion is active, Cast promotion is active, and LifeScore is locked until release.', tone: 'ok' };
    }

    if (/what can you do|capabilit|help me|command list|available commands/.test(t)) {
      return {
        text: 'I operate the Deadset, Cast and LifeScore promotion system. I can forge, clone and recalibrate protocols; control selected automation fleets; create truth-locked TikTok campaigns; render exact app proof; inspect intelligence and execution traces; open owner review; and deliver only through explicit external authority. I will name any real blocker instead of pretending.',
        tone: 'ok',
      };
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
      const attention = automations.filter((automation) => automation.status === 'failed');
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

    if (/\b(forge|build|create|configure)\b.*\b(automation|protocol|agent)\b|\bnew (automation|protocol|agent)\b/.test(t)) {
      setExpanded(false);
      onOpenForge();
      return { text: 'Opened the Protocol Forge in free-input mode.', tone: 'ok' };
    }

    if (/\b(open|show|switch to)\b.*\b(protocol mesh|protocols|fleet control)\b/.test(t)) {
      setExpanded(false);
      onSetMode('protocols');
      return { text: 'Protocol Mesh online. Fleet control is ready.', tone: 'ok' };
    }

    if (/\b(open|show|switch to)\b.*\b(intelligence|signals|learning)\b/.test(t)) {
      setExpanded(false);
      onSetMode('signals');
      return { text: 'Intelligence Room online.', tone: 'ok' };
    }

    if (/\b(open|show|switch to)\b.*\b(control deck|operations|aegis)\b/.test(t)) {
      setExpanded(false);
      onSetMode('operations');
      return { text: 'Sovereign Control Deck online.', tone: 'ok' };
    }

    if (/^(?:(?:open|show|inspect|view)\s+(?:the\s+)?)?(?:queue|review queue|drafts?)$/.test(t)) {
      navigate('/queue');
      return { text: 'Opened the review queue.', tone: 'ok' };
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

    if (/\b(draft|create|make|prepare|generate)\b/.test(t)
      && /\b(carousel|carousels|video|videos|brief|briefs|concept|concepts|content|tiktok|post|posts)\b/.test(t)) {
      const requestedApp = findApp(t);
      if (!requestedApp) {
        return { text: 'Name Cast or Deadset so I can lock the command to the correct product playbook.', tone: 'warn' };
      }

      const readiness = await api<PromotionReadiness>('/promotion/readiness');
      const promotionApp = readiness.apps.find((candidate) => candidate.id === requestedApp.id);
      if (!promotionApp) return { text: `${requestedApp.name} promotion is not active.`, tone: 'warn' };
      if (!promotionApp.drafting_ready) {
        return { text: promotionApp.blockers[0] ?? `${requestedApp.name} drafting is not ready.`, tone: 'warn' };
      }

      const count = commandCount(t);
      const format = /\b(video|videos|clip|clips|brief|briefs|script|scripts)\b/.test(t)
        ? 'video_brief'
        : 'photo_carousel';
      const library = readiness.feature_libraries[requestedApp.slug] ?? [];
      const normalized = t.replaceAll('_', ' ').replaceAll('-', ' ');
      const namedFeatures = library.filter((feature) => (
        normalized.includes(feature.key.replaceAll('_', ' '))
        || normalized.includes(feature.label.toLowerCase())
      ));
      const unavailable = namedFeatures.find((feature) => !feature.uploaded);
      if (format === 'photo_carousel' && unavailable) {
        return { text: `${unavailable.label} is not loaded yet. Open Creative Studio and add the exact current screen first.`, tone: 'warn' };
      }
      const readyFeatures = library.filter((feature) => feature.uploaded);
      const featureRotation = format === 'photo_carousel'
        ? (namedFeatures.length ? namedFeatures : readyFeatures).slice(0, Math.max(1, count)).map((feature) => feature.key)
        : [];
      if (format === 'photo_carousel' && featureRotation.length === 0) {
        return { text: `No verified ${requestedApp.name} feature screen is ready. Open Creative Studio first.`, tone: 'warn' };
      }

      const goal = /\b(download|downloads|install|installs)\b/.test(t)
        ? 'downloads'
        : /\b(trust|credible|credibility)\b/.test(t)
          ? 'trust'
          : /\b(engage|engagement|comment|comments|conversation)\b/.test(t)
            ? 'engagement'
            : 'feature_discovery';
      const angle = /\b(problem|solution|frustrat|pain point)\b/.test(t)
        ? 'problem_solution'
        : /\b(proof|demo|demonstrate)\b/.test(t)
          ? 'proof'
          : /\b(routine|daily|habit)\b/.test(t)
            ? 'routine'
            : 'relatable';
      const audience = promotionApp.content_domain === 'fishing'
        ? /\b(new angler|new anglers|beginner)\b/.test(t)
          ? 'new_anglers'
          : /\b(serious angler|serious anglers|advanced)\b/.test(t)
            ? 'serious_anglers'
            : /\b(crew|crews|friends|local)\b/.test(t)
              ? 'local_crews'
              : 'weekend_anglers'
        : /\b(new lifter|new lifters|beginner)\b/.test(t)
          ? 'new_lifters'
          : /\b(serious gym|advanced lifter|advanced lifters)\b/.test(t)
            ? 'serious_gym'
            : /\b(general fitness|casual)\b/.test(t)
              ? 'general_fitness'
              : 'consistent_lifters';
      const autoProduce = format === 'photo_carousel'
        && promotionApp.producer_available
        && promotionApp.photo_source_ready;

      await api('/promotion/missions', {
        method: 'POST',
        body: JSON.stringify({
          app_slug: requestedApp.slug,
          account_id: null,
          goal,
          audience,
          angle,
          content_format: format,
          draft_count: count,
          feature_rotation: featureRotation,
          auto_produce: autoProduce,
        }),
      });
      onChanged();
      const route = format === 'photo_carousel' ? 'carousel' : 'video brief';
      const productionNote = format === 'photo_carousel' && !autoProduce
        ? ' Drafting is running; final slide production will wait for its missing licensed-photo connection.'
        : '';
      return {
        text: `Launched ${count} ${requestedApp.name} ${route}${count === 1 ? '' : 's'} for ${audience.replaceAll('_', ' ')}. The mission is real and will stop in owner review.${productionNote}`,
        tone: autoProduce || format === 'video_brief' ? 'ok' : 'warn',
      };
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
    if (/film|shoot/.test(t) && /video|clip|post|short/.test(t)) {
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
        'That is outside the three-mission lock. Try “draft 3 Deadset carousels”, “draft 3 Cast carousels”, “show the queue”, “system status”, or “pause all”.',
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

  const content = (
    <>
      {expanded ? <button className="command-nexus-scrim" type="button" aria-label="Close JARVIS command nexus" onClick={() => setExpanded(false)} /> : null}
      <div className={`command-bar ${expanded ? 'expanded' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label={expanded ? 'JARVIS universal command nexus' : undefined}>
        {expanded ? (
          <header className="command-nexus-head">
            <div className="nexus-reactor" aria-hidden="true"><i /><i /><b /></div>
            <div><span>OWNER VOICE // UNIVERSAL ACTION BUS</span><h3>J.A.R.V.I.S. COMMAND NEXUS</h3><p>Describe the result. The system resolves the real route, protects external actions and reports any hard blocker.</p></div>
            <button type="button" onClick={() => setExpanded(false)} aria-label="Close command nexus">×</button>
          </header>
        ) : null}

        <div className={expanded ? 'command-nexus-grid' : undefined}>
          <section className="command-nexus-primary">
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
                {!expanded ? <button type="button" className="nexus-open" onClick={() => setExpanded(true)}>Open nexus</button> : null}
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
                placeholder={listening ? 'Listening…' : 'Describe the outcome, mission, audience, scope or system action…'}
                aria-label="Command JARVIS"
                disabled={busy}
              />
              <button className="primary" type="submit" disabled={busy || !value.trim()}>
                {busy ? 'RESOLVING…' : 'EXECUTE'}
              </button>
            </form>
            <div className="quick-actions">
              <button onClick={() => quick('what can you do')}>Capabilities</button>
              <button onClick={() => quick('system status')}>System status</button>
              <button onClick={() => quick('draft 3 Deadset carousels')}>Draft Deadset ×3</button>
              <button onClick={() => quick('draft 3 Cast carousels')}>Draft Cast ×3</button>
              <button onClick={() => quick('what needs attention')}>Diagnose</button>
              <button onClick={() => quick('show the queue')}>Review queue</button>
              <button
                className={shutdownArmed ? 'danger armed' : 'danger'}
                onClick={() => quick(shutdownArmed ? 'confirm stop everything' : 'stop everything')}
              >
                {shutdownArmed ? 'Confirm pause all' : 'Pause all'}
              </button>
            </div>
            <div className="command-contract" aria-label="Command execution contract">
              <span><i /> REAL ACTION BUS</span>
              <b>EXECUTE WHEN WIRED</b>
              <b>CONFIRM EXTERNAL ACTIONS</b>
              <b>REPORT BLOCKERS HONESTLY</b>
            </div>
          </section>

          {expanded ? (
            <aside className="command-nexus-aside">
              <section className="nexus-presence">
                <div className="nexus-sphere" aria-hidden="true"><i /><i /><i /><b /></div>
                <span>JARVIS PRESENCE</span><strong>{listening ? 'VOICE LINK ACTIVE' : busy ? 'RESOLVING INTENT' : 'AWAITING OWNER COMMAND'}</strong>
                <div className="nexus-wave" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} />)}</div>
              </section>
              <section className="nexus-capability-map">
                <header><span>LIVE COMMAND DOMAINS</span><b>05 WIRED</b></header>
                <dl>
                  <div><dt>MISSION COMPOSITION</dt><dd>READY</dd></div>
                  <div><dt>PROTOCOL EXECUTION</dt><dd>{automations.filter((automation) => automation.enabled).length} ONLINE</dd></div>
                  <div><dt>OWNER REVIEW</dt><dd>{drafts} WAITING</dd></div>
                  <div><dt>CHANNEL AUTHORITY</dt><dd>{accounts.filter((account) => account.status === 'connected').length} LINKED</dd></div>
                  <div><dt>EMERGENCY PAUSE</dt><dd>ARMED</dd></div>
                </dl>
              </section>
              <section className="nexus-language">
                <header><span>FREEFORM INPUT</span><b>NO PRESET REQUIRED</b></header>
                <p>Speak naturally. Include the app, desired result, audience, volume, angle or agent whenever it matters.</p>
                <div><span>“Draft four Cast concepts for new anglers focused on trust.”</span><span>“What needs my attention right now?”</span><span>“Run the Deadset production protocol.”</span></div>
              </section>
            </aside>
          ) : null}
        </div>
      </div>
    </>
  );

  return expanded ? createPortal(content, document.body) : content;
}
