import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/supabase';
import type { App, Automation } from '../lib/types';

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

export default function CommandBar({
  automations,
  apps,
  onChanged,
}: {
  automations: Automation[];
  apps: App[];
  onChanged: () => void;
}) {
  const [value, setValue] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  function findApp(text: string): App | undefined {
    return apps.find((a) => text.includes(a.slug) || text.includes(a.name.toLowerCase()));
  }

  function findAutomation(text: string): Automation | undefined {
    // Longest name first, so "Draft concepts — Cast" beats a bare "cast".
    return [...automations]
      .sort((a, b) => b.name.length - a.name.length)
      .find((a) => text.includes(a.name.toLowerCase()) || text.includes(a.handler_key));
  }

  async function run(text: string): Promise<Reply> {
    const t = text.toLowerCase().trim();

    if (/(^|\s)(queue|review|drafts?)(\s|$)/.test(t) && !/run|start/.test(t)) {
      navigate('/queue');
      return { text: 'Opened the review queue.', tone: 'ok' };
    }
    if (/report/.test(t)) {
      navigate('/reports');
      return { text: 'Opened reports.', tone: 'ok' };
    }
    if (/account|connect/.test(t)) {
      navigate('/accounts');
      return { text: 'Opened accounts.', tone: 'ok' };
    }

    if (/stop (everything|all)|kill|panic/.test(t)) {
      await api('/kill', { method: 'POST' });
      onChanged();
      return { text: 'Every automation is paused.', tone: 'warn' };
    }

    // "make a video about ..." -- the honest answer.
    if (/make|create|film|shoot/.test(t) && /video|clip|post|short/.test(t)) {
      const app = findApp(t);
      const agent = automations.find(
        (a) => a.handler_key === 'tiktok.generate' && (!app || a.app_id === app.id),
      );
      if (!agent) {
        return { text: 'No drafting agent is set up for that app yet.', tone: 'warn' };
      }
      await api(`/automations/${agent.id}/run`, { method: 'POST' });
      onChanged();
      return {
        text:
          `Queued concepts on ${agent.name}. It writes hooks, captions and shot notes — ` +
          'it cannot film or edit yet, so the video itself is still yours to make.',
        tone: 'warn',
      };
    }

    if (/^(run|start|trigger|go)\b/.test(t)) {
      const agent = findAutomation(t);
      if (!agent) return { text: 'No agent matched that name.', tone: 'warn' };
      if (agent.status === 'running') return { text: `${agent.name} is already working.`, tone: 'warn' };
      await api(`/automations/${agent.id}/run`, { method: 'POST' });
      onChanged();
      return { text: `${agent.name} is running.`, tone: 'ok' };
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
      setReply(await run(value));
      setValue('');
    } catch (err) {
      setReply({ text: err instanceof Error ? err.message : String(err), tone: 'warn' });
    } finally {
      setBusy(false);
    }
  }

  async function quick(text: string) {
    setBusy(true);
    try {
      setReply(await run(text));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="command-bar">
      {reply && (
        <div className={`command-reply ${reply.tone === 'warn' ? 'warn' : ''}`} role="status">
          {reply.text}
        </div>
      )}
      <form onSubmit={submit}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask the core anything, or say “make a video about Deadset”…"
          aria-label="Command the control plane"
          disabled={busy}
        />
        <button className="primary" type="submit" disabled={busy || !value.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
      <div className="quick-actions">
        <button onClick={() => quick('show the queue')}>Review queue</button>
        <button onClick={() => quick('run analytics sync')}>Sync analytics</button>
        <button onClick={() => quick('run morning report')}>Build report</button>
        <button onClick={() => navigate('/reports')}>Reports</button>
        <button onClick={() => quick('stop everything')}>Stop everything</button>
      </div>
    </div>
  );
}
