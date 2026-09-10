import HqBillingConnection from "../components/HqBillingConnection";
import HqProductConnection from "../components/HqProductConnection";
import { useEffect, useId, useState, type CSSProperties } from "react";
import {
  Link,
  NavLink,
  Navigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../lib/supabase";
import { useData } from "../lib/useData";
import type { HqPayload } from "../../../worker/src/lib/hq-contract";
import type { HqDay } from "../../../worker/src/lib/hq-metrics";
import "../app-hq.css";
function BillingHistory({ data, dates }: { data: HqPayload; dates: string[] }) {
  const [selected, setSelected] = useState("trials");
  const charts = data.billing_charts;
  if (!charts) return null;
  const chart =
    charts.charts.find((c) => c.id === selected) ?? charts.charts[0];
  return (
    <section className="ah-panel">
      <p className="ah-kicker">REVENUECAT HISTORY</p>
      <h2>Follow the subscription journey.</h2>
      <p className="ah-note">
        Daily provider reports, collected hourly. Incomplete days remain gaps.
        Trial conversion is grouped by trial-start day; pending trials can still
        change the result.
      </p>
      <label className="ah-form">
        Report
        <select
          value={chart?.id ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {charts.charts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      {chart && (
        <p className="ah-note">
          Collected {new Date(chart.captured_at).toLocaleString()} ·{" "}
          {chart.description}
        </p>
      )}
      {Object.entries(charts.errors).map(([id, error]) => (
        <p key={id} role="alert">
          {id}: {error}. Last good data is retained.
        </p>
      ))}
      <div className="ah-two">
        {chart?.series.map((series, i) =>
          series.points.length ? (
            <Chart
              key={chart.id + i}
              title={series.label + (series.unit === "%" ? " (%)" : "")}
              note={series.description}
              money={series.unit === "$"}
              points={dates.map((date) => ({
                date,
                value:
                  series.points.find((p) => p.date === date)?.value ?? null,
              }))}
            />
          ) : (
            <Card
              key={chart.id + i}
              label={series.label}
              value={series.current}
              money={series.unit === "$"}
              note={series.description + (series.unit === "%" ? " · %" : "")}
            />
          ),
        )}
      </div>
    </section>
  );
}
const sections = [
  ["overview", "Overview", "◈"],
  ["store", "App Store", "↗"],
  ["product", "Product & retention", "◎"],
  ["revenue", "Revenue", "£"],
  ["content", "Content & operations", "▷"],
  ["sources", "Connections", "⌘"],
];
const fmt = (v: number | null | undefined, money = false) =>
  v == null
    ? "—"
    : money
      ? new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "GBP",
          maximumFractionDigits: 0,
        }).format(v)
      : v.toLocaleString("en-GB", { maximumFractionDigits: 1 });
function Card({
  label,
  value,
  note,
  money = false,
}: {
  label: string;
  value: number | null | undefined;
  note: string;
  money?: boolean;
}) {
  return (
    <article className="ah-kpi">
      <span>{label}</span>
      <strong>{fmt(value, money)}</strong>
      <small>{note}</small>
    </article>
  );
}
type Point = { date: string; value: number | null };
function Chart({
  title,
  note,
  points,
  money = false,
}: {
  title: string;
  note: string;
  points: Point[];
  money?: boolean;
}) {
  const { app } = useParams();
  const id = useId().replace(/:/g, ""),
    available = points.filter((p) => p.value !== null),
    max = Math.max(1, ...available.map((p) => p.value!)),
    min = Math.min(0, ...available.map((p) => p.value!));
  const x = (i: number) => 42 + (i / Math.max(1, points.length - 1)) * 700,
    y = (v: number) => 190 - ((v - min) / (max - min)) * 160;
  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = "";
    } else current += `${current ? " L" : "M"}${x(i)},${y(p.value)} `;
  });
  if (current) segments.push(current);
  return (
    <section className="ah-panel ah-chart">
      <div className="ah-panel-head">
        <div>
          <p className="ah-kicker">PERFORMANCE</p>
          <h2>{title}</h2>
        </div>
        <span className="ah-chip">{available.length} observations</span>
      </div>
      <p className="ah-note">{note}</p>
      {available.length ? (
        <>
          <svg viewBox="0 0 780 230" role="img" aria-labelledby={id}>
            <title id={id}>
              {title}. {available.length} recorded values. Missing dates are
              gaps; values are available in the table below.
            </title>
            {[0, 0.5, 1].map((n) => (
              <g key={n}>
                <line
                  x1="42"
                  x2="744"
                  y1={30 + n * 160}
                  y2={30 + n * 160}
                  stroke="currentColor"
                  opacity=".1"
                />
                <text x="35" y={34 + n * 160} textAnchor="end">
                  {fmt(max - n * (max - min), money)}
                </text>
              </g>
            ))}
            {segments.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="var(--hq-accent)"
                strokeWidth="3"
              />
            ))}
            {points.map((p, i) =>
              p.value === null ? null : (
                <circle
                  key={p.date}
                  cx={x(i)}
                  cy={y(p.value)}
                  r="4"
                  fill="var(--hq-accent)"
                >
                  <title>
                    {p.date}: {fmt(p.value, money)}
                  </title>
                </circle>
              ),
            )}
            <text x="42" y="221">
              {points[0]?.date}
            </text>
            <text x="744" y="221" textAnchor="end">
              {points.at(-1)?.date}
            </text>
          </svg>
          <details>
            <summary>View chart data</summary>
            <div className="ah-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>{title}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.date}>
                      <td>{p.date}</td>
                      <td>{fmt(p.value, money)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="ah-empty-chart">
          <div className="ah-grid-lines" />
          <span>↗</span>
          <h3>Your next signal starts here.</h3>
          <p>No verified observations for this period.</p>
          <Link to={`/hq/${app}/sources`}>Connect or import a report →</Link>
        </div>
      )}
    </section>
  );
}
function Connections({
  app,
  data,
  onChange,
}: {
  app: string;
  data: HqPayload | null;
  onChange: () => void;
}) {
  const [apps, setApps] = useState<
      Array<{ id: string; name: string; sku: string }>
    >([]),
    [selected, setSelected] = useState(""),
    [vendor, setVendor] = useState(""),
    [issuer, setIssuer] = useState(""),
    [key, setKey] = useState(""),
    [privateKey, setPrivateKey] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (data?.apple_settings) {
      setSelected(data.apple_settings.apple_app_id);
      setVendor(data.apple_settings.vendor_number);
    }
  }, [data?.apple_settings]);
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      await work();
      setNotice(message);
      onChange();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }
  async function catalog() {
    const r = await api<{ apps: typeof apps }>(`/hq/${app}/catalog`);
    setApps(r.apps);
  }
  function template() {
    download(
      "hq-report-template.json",
      JSON.stringify(
        {
          app,
          source: "product_export",
          description: "Replace this with the verified source and coverage",
          days: [
            {
              date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
              active_users: null,
              signups: null,
              sessions: null,
              actions: null,
              retention_d1: null,
              retention_d7: null,
              retention_d30: null,
            },
          ],
        },
        null,
        2,
      ),
      "application/json",
    );
  }
  return (
    <>
      <section className="ah-panel">
        <p className="ah-kicker">SOURCE COVERAGE</p>
        <h2>Every number has a source.</h2>
        <div className="ah-integrations">
          {[
            [
              "Product database",
              data?.product
                ? "Connected · live collection"
                : data?.baseline
                  ? "Snapshot only"
                  : "Source key required",
              app === "deadset"
                ? "Profiles, workout activity and Stripe subscription snapshots."
                : "Live profiles, recorded catches and started fishing sessions.",
            ],
            [
              "App Store Connect",
              data?.apple_settings
                ? "Configured · check sync result"
                : data?.apple_configured
                  ? "Key connected · map this app"
                  : "Reporting key required",
              "Daily first-time downloads, re-downloads and proceeds by currency.",
            ],
            [
              "TikTok",
              data?.channels.length
                ? `${data.channels.length} channel(s)`
                : "No connected channel",
              "Follower snapshots and sampled post lifetime engagement.",
            ],
            [
              "Billing & retention",
              data?.billing
                ? "Connected · RevenueCat"
                : data?.records.some((r) => r.source === "billing_export")
                  ? "Imported reports"
                  : "Report import available",
              "MRR, renewals, trials, cancellations and mature retention cohorts.",
            ],
          ].map(([name, status, detail]) => (
            <article key={name}>
              <div>
                <strong>{name}</strong>
                <p>{detail}</p>
              </div>
              <span className="ah-chip">{status}</span>
            </article>
          ))}
        </div>
      </section>
      <HqProductConnection app={app} data={data} onChange={onChange} />
      <HqBillingConnection app={app} data={data} onChange={onChange} />
      <section className="ah-panel">
        <p className="ah-kicker">APPLE REPORTING</p>
        <h2>Bring downloads into the picture.</h2>
        <p className="ah-note">
          Use an App Store Connect key with reporting access. Keys stay
          encrypted on the server. Daily reports sync at 08:30 UTC after setup.
        </p>
        {!data?.apple_configured && (
          <form
            className="ah-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api("/integrations/app-store", {
                  method: "PUT",
                  body: JSON.stringify({
                    issuer_id: issuer,
                    key_id: key,
                    private_key: privateKey,
                  }),
                });
                setPrivateKey("");
                await catalog();
              }, "Apple key connected. Select the correct app below.");
            }}
          >
            <label>
              Issuer ID
              <input
                required
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </label>
            <label>
              Key ID
              <input
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <label className="ah-wide">
              Private key (.p8 file)
              <input
                required
                type="file"
                accept=".p8"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && f.size < 20000) void f.text().then(setPrivateKey);
                }}
              />
            </label>
            <button disabled={busy}>Connect Apple key</button>
          </form>
        )}
        {data?.apple_configured && (
          <>
            <button
              disabled={busy}
              onClick={() => void act(catalog, "Apple apps loaded.")}
            >
              Load Apple apps
            </button>
            <form
              className="ah-form"
              onSubmit={(e) => {
                e.preventDefault();
                const item = apps.find((a) => a.id === selected);
                void act(
                  () =>
                    api(`/hq/${app}/settings`, {
                      method: "PUT",
                      body: JSON.stringify({
                        apple_app_id: selected,
                        vendor_number: vendor,
                        sku: item?.sku ?? data.apple_settings?.sku,
                      }),
                    }),
                  "App mapping saved. Use Sync Apple reports to load the latest seven days.",
                );
              }}
            >
              <label>
                Apple app
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  required
                >
                  <option value="">Select {app.toUpperCase()}</option>
                  {data.apple_settings && !apps.length && (
                    <option value={data.apple_settings.apple_app_id}>
                      Saved app {data.apple_settings.apple_app_id}
                    </option>
                  )}
                  {apps.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name} · {a.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vendor number
                <input
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  required
                  pattern="[0-9]{5,20}"
                  placeholder="Sales and Trends → Reports"
                />
              </label>
              <button disabled={busy}>Save app mapping</button>
            </form>
          </>
        )}
        <p className="ah-note">
          <a
            href="https://appstoreconnect.apple.com/access/integrations/api"
            target="_blank"
            rel="noreferrer"
          >
            Open App Store Connect keys ↗
          </a>
        </p>
      </section>
      <section className="ah-panel">
        <p className="ah-kicker">VERIFIED REPORTS</p>
        <h2>Import the sources you already have.</h2>
        <p className="ah-note">
          Import aggregate daily JSON for this app. Use app_store_export,
          product_export or billing_export. Missing values stay unknown; imports
          are labelled and never treated as a live provider connection.
        </p>
        <div className="ah-buttons">
          <button onClick={template}>Download template</button>
          <label className="ah-file">
            Import report
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 100000)
                    setNotice("Report must be under 100 KB.");
                  else
                    void act(
                      async () =>
                        api(`/hq/${app}/import`, {
                          method: "POST",
                          body: await f.text(),
                        }),
                      "Report imported. Charts have been refreshed.",
                    );
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <details>
          <summary>Supported daily fields</summary>
          <p className="ah-note">
            App Store: downloads, redownloads, impressions, store_views,
            refunds, proceeds (currency → amount). Product: active_users,
            signups, sessions, actions, retention_d1, retention_d7,
            retention_d30 (percentages from mature cohorts). Billing:
            subscribers, trials, new_subscribers, cancellations, renewals,
            refunds, mrr_gbp. Include only verified values for each date.
          </p>
        </details>
        {data?.records.length ? (
          <div className="ah-table">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Report date</th>
                  <th>Imported / synced</th>
                </tr>
              </thead>
              <tbody>
                {data.records
                  .slice(-12)
                  .reverse()
                  .map((r, i) => (
                    <tr key={i}>
                      <td title={r.description}>{r.source}</td>
                      <td>{r.data.date}</td>
                      <td>{new Date(r.captured_at).toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {notice && (
        <p role="status" className="ah-notice">
          {notice}
        </p>
      )}
    </>
  );
}
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AppHQ() {
  const params = useParams(),
    [query] = useSearchParams(),
    app = params.app === "cast" ? "cast" : "deadset",
    section = params.section ?? "overview";
  if (
    !["cast", "deadset"].includes(params.app ?? "") ||
    !sections.some((s) => s[0] === section)
  )
    return <Navigate to="/hq/deadset/overview" replace />;
  // Keying the workspace prevents an in-flight response for one app appearing under the other brand.
  return (
    <Workspace
      key={`${app}-${query.get("days")}`}
      app={app}
      section={section}
    />
  );
}
function Workspace({
  app,
  section,
}: {
  app: "deadset" | "cast";
  section: string;
}) {
  const [search, setSearch] = useSearchParams(),
    days = [7, 30, 90].includes(Number(search.get("days")))
      ? Number(search.get("days"))
      : 30;
  const { data, error, loading, refresh } = useData(
    () => api<HqPayload>(`/hq/${app}?days=${days}`),
    [app, days],
    60000,
  );
  const [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [chartMetric, setChartMetric] = useState<
      "downloads" | "active_users" | "posts"
    >("posts");
  useEffect(() => {
    document.title = `${app.toUpperCase()} HQ · JARVIS`;
  }, [app]);
  const b = data?.baseline,
    name = app === "cast" ? "CAST" : "DEADSET";
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - (days - i) * 86400000).toISOString().slice(0, 10),
  );
  const rows = dates.map(
    (date) => data?.days.find((d) => d.date === date) ?? { date },
  );
  const total = (key: keyof HqDay) =>
    rows.every((d) => typeof d[key] === "number")
      ? rows.reduce((n, d) => n + (d[key] as number), 0)
      : null;
  const coverage = (key: keyof HqDay) =>
    `${rows.filter((d) => typeof d[key] === "number").length}/${days} report days`;
  const latest = (key: keyof HqDay) =>
    [...(data?.days ?? [])].reverse().find((d) => typeof d[key] === "number");
  const value = (key: keyof HqDay) => {
    const d = latest(key);
    return d ? (d[key] as number) : null;
  };
  const dated = (key: keyof HqDay) =>
    latest(key)
      ? `Snapshot · ${latest(key)!.date}`
      : "Awaiting verified report";
  const points = (key: keyof HqDay) =>
    rows.map((d) => ({
      date: d.date,
      value: typeof d[key] === "number" ? (d[key] as number) : null,
    }));
  const published = (data?.posts ?? []).filter(
    (p) =>
      p.status === "published" &&
      p.published_at &&
      dates.includes(p.published_at.slice(0, 10)),
  );
  const postPoints = dates.map((date) => ({
    date,
    value:
      data &&
      !data.errors.some((e) => e.startsWith("Content could not refresh"))
        ? published.filter((p) => p.published_at?.startsWith(date)).length
        : null,
  }));
  const newestPosts = new Map<
    string,
    NonNullable<typeof data>["post_metrics"][number]
  >();
  for (const m of data?.post_metrics ?? [])
    if (!newestPosts.has(`${m.account_id}/${m.tiktok_post_id}`))
      newestPosts.set(`${m.account_id}/${m.tiktok_post_id}`, m);
  const topPosts = [...newestPosts.values()].sort(
    (a, b) => (b.views ?? -1) - (a.views ?? -1),
  );
  async function action(key: string, work: () => Promise<unknown>) {
    setBusy(key);
    setNotice("");
    try {
      const r = (await work()) as { saved?: number; errors?: string[] };
      setNotice(
        r?.saved !== undefined
          ? `${r.saved} daily reports synced.${r.errors?.length ? " " + r.errors.join("; ") : ""}`
          : "Saved.",
      );
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy("");
    }
  }
  async function refreshSources() {
    setBusy("refresh");
    setNotice("");
    try {
      const result = await api<{
        product: { status: string; at?: string; error?: string };
        billing: { status: string; error?: string };
        analytics: string;
        apple: string;
      }>(`/hq/${app}/refresh`, { method: "POST" });
      setNotice(
        `Product: ${result.product.status}${result.product.at ? " · " + new Date(result.product.at).toLocaleTimeString() : ""}${result.product.error ? " · " + result.product.error : ""}. Billing: ${result.billing.status}${result.billing.error ? " · " + result.billing.error : ""}. TikTok: ${result.analytics}. Apple: ${result.apple}.`,
      );
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not refresh providers");
    } finally {
      setBusy("");
    }
  }
  function exportCsv() {
    const keys = [
      "date",
      "downloads",
      "redownloads",
      "impressions",
      "store_views",
      "active_users",
      "signups",
      "sessions",
      "actions",
      "subscribers",
      "trials",
      "mrr_gbp",
      "new_subscribers",
      "cancellations",
      "renewals",
      "refunds",
      "retention_d1",
      "retention_d7",
      "retention_d30",
    ] as const;
    download(
      `${app}-hq-${days}d.csv`,
      [
        keys.join(","),
        ...rows.map((r) => keys.map((k) => r[k] ?? "").join(",")),
      ].join("\n"),
      "text/csv",
    );
  }
  const chart = (
    <>
      <div className="ah-segment" aria-label="Overview chart metric">
        {(["posts", "downloads", "active_users"] as const).map((k) => (
          <button
            aria-pressed={chartMetric === k}
            key={k}
            onClick={() => setChartMetric(k)}
          >
            {k === "posts"
              ? "Published posts"
              : k === "downloads"
                ? "Downloads"
                : "Active users"}
          </button>
        ))}
      </div>
      <Chart
        title={
          chartMetric === "posts"
            ? "Publishing rhythm"
            : chartMetric === "downloads"
              ? "Downloads over time"
              : "Recorded activity users / day"
        }
        note={
          chartMetric === "posts"
            ? "Published JARVIS posts per complete UTC day."
            : chartMetric === "downloads"
              ? "First-time App Store downloads. Gaps indicate unavailable daily reports."
              : "Product report active users, using the source’s definition. Synced workout users are shown separately."
        }
        points={chartMetric === "posts" ? postPoints : points(chartMetric)}
      />
    </>
  );
  return (
    <div
      className={`app-hq ah-${app}`}
      style={
        {
          "--hq-accent": app === "cast" ? "#72d2bd" : "#ff594b",
        } as CSSProperties
      }
    >
      <header className="ah-top">
        <Link to="/" className="ah-back">
          ← JARVIS
        </Link>
        <nav aria-label="Switch app HQ">
          {(["deadset", "cast"] as const).map((a) => (
            <NavLink
              key={a}
              to={`/hq/${a}/overview`}
              className={app === a ? "active" : ""}
            >
              <i className={`ah-dot ${a}`} />
              {a.toUpperCase()} <small>HQ</small>
            </NavLink>
          ))}
        </nav>
        <span className="ah-private">◈ OWNER WORKSPACE</span>
      </header>
      <div className="ah-body">
        <aside className="ah-sidebar">
          <Link to={`/hq/${app}/overview`} className="ah-logo">
            {name}
            <span>HQ</span>
          </Link>
          <p className="ah-kicker">YOUR APP. THE WHOLE PICTURE.</p>
          <nav aria-label={`${name} HQ sections`}>
            {sections.map(([key, title, icon]) => (
              <NavLink to={`/hq/${app}/${key}?days=${days}`} key={key}>
                <span>{icon}</span>
                {title}
              </NavLink>
            ))}
          </nav>
          <div className="ah-sidebar-bottom">
            <p>Connected to JARVIS</p>
            <Link to={`/queue?app=${app}`}>Review creative ↗</Link>
            <Link to={`/promote?app=${app}`}>Create a mission ↗</Link>
            {app === "deadset" && (
              <a
                href="https://deadset-hq.theojandhyala.workers.dev"
                target="_blank"
                rel="noreferrer"
              >
                Original DEADSET HQ ↗
              </a>
            )}
          </div>
        </aside>
        <main className="ah-main">
          <div className="ah-heading">
            <div>
              <p className="ah-kicker">
                {name} /{" "}
                {sections.find((s) => s[0] === section)?.[1] ?? "Overview"}
              </p>
              <h1>
                {section === "overview" ? (
                  <>
                    The bigger <em>picture.</em>
                  </>
                ) : section === "store" ? (
                  <>
                    Every download.
                    <br />
                    <em>Every discovery.</em>
                  </>
                ) : section === "product" ? (
                  <>
                    Build a reason
                    <br />
                    <em>to return.</em>
                  </>
                ) : section === "revenue" ? (
                  <>
                    Know what
                    <br />
                    <em>pays off.</em>
                  </>
                ) : section === "content" ? (
                  <>
                    Attention into
                    <br />
                    <em>understanding.</em>
                  </>
                ) : (
                  <>
                    Connect the <em>dots.</em>
                  </>
                )}
              </h1>
              <p>
                {app === "cast"
                  ? "From the first cast to the next catch."
                  : "From the first workout to a lasting habit."}{" "}
                Your app’s operating dashboard.
              </p>
            </div>
            <div className="ah-heading-actions">
              <div className="ah-segment" aria-label="Reporting period">
                {[7, 30, 90].map((n) => (
                  <button
                    key={n}
                    aria-pressed={days === n}
                    onClick={() => setSearch({ days: String(n) })}
                  >
                    {n}D
                  </button>
                ))}
              </div>
              <div className="ah-buttons">
                <button onClick={refreshSources} disabled={loading || !!busy}>
                  {busy === "refresh" ? "Checking sources…" : "↻ Refresh"}
                </button>
                <button onClick={exportCsv} disabled={!data}>
                  Export CSV ↓
                </button>
              </div>
            </div>
          </div>
          <div className="ah-freshness">
            <span>
              <i />
              {loading
                ? "Loading sources…"
                : data
                  ? `Dashboard refreshed ${new Date(data.refreshed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : "Waiting for data"}
            </span>
            <span>
              {dates[0]} — {dates.at(-1)} · UTC
            </span>
          </div>
          {data?.product && (
            <p className="ah-note">
              Product source collected{" "}
              {new Date(data.product.captured_at).toLocaleString()} · updates
              every five minutes. {data.product.definition}{" "}
              {Date.now() - Date.parse(data.product.captured_at) > 15 * 60000
                ? "Source delayed — use Refresh and check Connections."
                : ""}
            </p>
          )}
          {data?.product_status?.error && (
            <p role="alert" className="ah-notice">
              Product sync failed: {data.product_status.error} Previous
              successful data is preserved.
            </p>
          )}
          {error && (
            <p role="alert" className="ah-notice">
              {error} Displayed data may be from the last successful refresh.
            </p>
          )}
          {data?.errors.map((e) => (
            <p role="alert" className="ah-notice" key={e}>
              {e}
            </p>
          ))}
          {notice && (
            <p role="status" className="ah-notice">
              {notice}
            </p>
          )}
          {section === "overview" && (
            <>
              <div className="ah-kpis">
                <Card
                  label="First-time downloads"
                  value={total("downloads")}
                  note={coverage("downloads")}
                />
                <Card
                  label={
                    data?.billing
                      ? "RevenueCat MRR"
                      : "Monthly recurring revenue"
                  }
                  value={value("mrr_gbp")}
                  money
                  note={dated("mrr_gbp")}
                />
                <Card
                  label={
                    data?.product
                      ? "Recorded activity users / 7D"
                      : b
                        ? "Workout-active users / 7D"
                        : "Recorded activity users / day"
                  }
                  value={
                    data?.product?.activity_users_7d ??
                    b?.workout_active_7d ??
                    value("active_users")
                  }
                  note={
                    data?.product
                      ? `Collected ${new Date(data.product.captured_at).toLocaleTimeString()}`
                      : b
                        ? `Synced workouts · ${b.captured_at.slice(0, 10)}`
                        : dated("active_users")
                  }
                />
                <Card
                  label="Published posts"
                  value={data ? published.length : null}
                  note={`Last ${days} complete days · JARVIS`}
                />
              </div>
              {chart}
              <div className="ah-two">
                <section className="ah-panel">
                  <p className="ah-kicker">ACTIVATION</p>
                  <h2>
                    {app === "cast"
                      ? "Turn interest into a habit."
                      : "The first two workouts matter."}
                  </h2>
                  {b ? (
                    <>
                      <div className="ah-bars">
                        {[
                          ["Registered profiles", b.registered_users],
                          ["Synced profiles", b.synced_users],
                          ["First workout", b.first_workout_users],
                          ["Second workout", b.second_workout_users],
                        ].map(([l, v]) => (
                          <div key={l}>
                            <span>
                              {l}
                              <b>{fmt(Number(v))}</b>
                            </span>
                            <i
                              style={{
                                width: `${Math.max(1, (Number(v) / Math.max(1, b.registered_users)) * 100)}%`,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="ah-note">
                        All-time observed funnel · {b.captured_at.slice(0, 10)}.
                        Synced records, not cohort conversion.
                      </p>
                    </>
                  ) : data?.product ? (
                    <>
                      <div className="ah-bars">
                        {[
                          [
                            "Registered profiles",
                            data.product.registered_users,
                          ],
                          [
                            "First recorded catch",
                            data.product.first_action_users,
                          ],
                          [
                            "Second recorded catch",
                            data.product.second_action_users,
                          ],
                        ].map(([label, n]) => (
                          <div key={label}>
                            <span>
                              {label}
                              <b>{n}</b>
                            </span>
                            <i
                              style={{
                                width: `${(Number(n) / Math.max(1, data.product!.registered_users)) * 100}%`,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="ah-note">
                        Observed recorded catches, excluding known legacy sample
                        catches.
                      </p>
                    </>
                  ) : (
                    <div className="ah-empty">
                      <p>
                        Connect product activity to see signups, first catches
                        and repeat use.
                      </p>
                      <Link to={`/hq/${app}/sources`}>
                        Connect product reports →
                      </Link>
                    </div>
                  )}
                </section>
                <section className="ah-panel">
                  <p className="ah-kicker">YOUR NEXT MOVE</p>
                  <h2>
                    {data?.apple_settings
                      ? "Check the signals."
                      : "Connect App Store reporting."}
                  </h2>
                  <p className="ah-note">
                    {data?.apple_settings
                      ? "Compare downloads with publishing and product activity over the same period. Views alone do not establish attribution."
                      : "Bring verified downloads and proceeds alongside your content. Add the Apple reporting key, select this app and enter your vendor number."}
                  </p>
                  <Link className="ah-primary" to={`/hq/${app}/sources`}>
                    Open connections ↗
                  </Link>
                  <div className="ah-mini">
                    <span>Drafts awaiting review</span>
                    <strong>
                      {data?.posts.filter((p) => p.status === "draft").length ??
                        "—"}
                    </strong>
                  </div>
                  <Link to={`/queue?app=${app}`}>Review {name} posts →</Link>
                </section>
              </div>
            </>
          )}
          {section === "store" && (
            <>
              <div className="ah-kpis">
                <Card
                  label="First-time downloads"
                  value={total("downloads")}
                  note={coverage("downloads")}
                />
                <Card
                  label="Re-downloads"
                  value={total("redownloads")}
                  note={coverage("redownloads")}
                />
                <Card
                  label="Store impressions"
                  value={total("impressions")}
                  note={coverage("impressions") + " · analytics export"}
                />
                <Card
                  label="Product page views"
                  value={total("store_views")}
                  note={coverage("store_views") + " · analytics export"}
                />
              </div>
              <div className="ah-callout">
                <div>
                  <h3>Apple Sales & Trends</h3>
                  <p>
                    {data?.apple_sync
                      ? `Last attempt ${new Date(data.apple_sync.at).toLocaleString()} · ${data.apple_sync.saved} daily reports saved`
                      : "Daily sync is ready once reporting access is connected."}
                  </p>
                  {data?.apple_sync?.errors.map((e) => (
                    <small key={e}>{e}</small>
                  ))}
                </div>
                <button
                  disabled={!!busy || !data?.apple_settings}
                  onClick={() =>
                    void action("apple", () =>
                      api(`/hq/${app}/sync`, { method: "POST" }),
                    )
                  }
                >
                  {busy === "apple" ? "Syncing…" : "Sync Apple reports"}
                </button>
                <Link to={`/hq/${app}/sources`}>Configure →</Link>
              </div>
              <Chart
                title="First-time downloads"
                note="Positive first-time app units from Apple Sales & Trends. Re-downloads and updates are excluded. Missing reports remain gaps."
                points={points("downloads")}
              />
              <div className="ah-two">
                <Chart
                  title="Re-downloads"
                  note="Returning downloads, reported separately from new app units."
                  points={points("redownloads")}
                />
                <Chart
                  title="Product page views"
                  note="Requires an App Store analytics export. Sales reports do not include listing traffic."
                  points={points("store_views")}
                />
              </div>
            </>
          )}
          {section === "product" && (
            <>
              <div className="ah-kpis">
                <Card
                  label={
                    data?.product || b ? "Registered profiles" : "New accounts"
                  }
                  value={
                    data?.product?.registered_users ??
                    b?.registered_users ??
                    total("signups")
                  }
                  note={b ? "All-time product snapshot" : coverage("signups")}
                />
                <Card
                  label={b ? "Workouts / last 7 days" : "Catches / activity"}
                  value={b?.workouts_7d ?? total("actions")}
                  note={b ? "Completed, synced workouts" : coverage("actions")}
                />
                <Card
                  label="D7 retention"
                  value={value("retention_d7")}
                  note={dated("retention_d7") + " · %"}
                />
                <Card
                  label="D30 retention"
                  value={value("retention_d30")}
                  note={dated("retention_d30") + " · %"}
                />
              </div>
              <Chart
                title="Recorded activity users / day"
                note={
                  data?.product?.definition ??
                  "Awaiting product activity reports."
                }
                points={points("active_users")}
              />
              {data?.product && (
                <div className="ah-kpis">
                  <Card
                    label="Activity users / 24 hours"
                    value={data.product.activity_users_24h}
                    note="Live recorded activity"
                  />
                  <Card
                    label="Activity users / 7 days"
                    value={data.product.activity_users_7d}
                    note="Rolling seven days"
                  />
                  <Card
                    label={
                      app === "cast"
                        ? "Catches recorded today"
                        : "Workouts completed today"
                    }
                    value={data.product.days.at(-1)?.actions}
                    note="Today · UTC · partial day"
                  />
                  <Card
                    label="New profiles today"
                    value={data.product.days.at(-1)?.signups}
                    note="Today · UTC · partial day"
                  />
                </div>
              )}
              <div className="ah-two">
                <Chart
                  title="D1 retention (%)"
                  note="Mature cohorts only. Missing cohort reports are not treated as zero."
                  points={points("retention_d1")}
                />
                <Chart
                  title="D7 retention (%)"
                  note="Use the same cohort definition across reports."
                  points={points("retention_d7")}
                />
              </div>
              {b && (
                <section className="ah-panel">
                  <h2>Recorded acquisition sources</h2>
                  <div className="ah-bars">
                    {b.sources.map((s) => (
                      <div key={s.source}>
                        <span>
                          {s.source}
                          <b>{s.users} profiles</b>
                        </span>
                        <i
                          style={{
                            width: `${(s.users / Math.max(1, b.registered_users)) * 100}%`,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="ah-note">
                    All-time first-touch records; unattributed users remain
                    unattributed. Snapshot{" "}
                    {new Date(b.captured_at).toLocaleString()}.
                  </p>
                </section>
              )}
            </>
          )}
          {section === "revenue" && (
            <>
              {data?.billing && (
                <section className="ah-panel">
                  <p className="ah-kicker">LIVE REVENUECAT · GBP</p>
                  <h2>Your subscription metrics.</h2>
                  <p className="ah-note">
                    Production metrics · collected{" "}
                    {new Date(data.billing.captured_at).toLocaleString()}. Each
                    metric retains RevenueCat’s own reporting window. Web Stripe
                    totals are separate.
                  </p>
                  <div className="ah-kpis">
                    {data.billing.metrics.map((m) => (
                      <Card
                        key={m.id}
                        label={m.name}
                        value={m.value}
                        money={["£", "GBP", "$"].includes(m.unit)}
                        note={`${m.description} · ${m.period === "P0D" ? "Current" : m.period === "P28D" ? "28-day window" : m.period}${m.last_updated_at ? " · provider updated " + new Date(m.last_updated_at).toLocaleString() : ""}`}
                      />
                    ))}
                  </div>
                </section>
              )}
              {data?.billing_status?.error && (
                <p role="alert" className="ah-notice">
                  Billing sync: {data.billing_status.error}
                </p>
              )}
              <div className="ah-kpis">
                <Card
                  label={data?.billing ? "RevenueCat MRR" : "MRR"}
                  value={value("mrr_gbp")}
                  money
                  note={dated("mrr_gbp")}
                />
                <Card
                  label="ARR run rate"
                  value={
                    value("mrr_gbp") === null ? null : value("mrr_gbp")! * 12
                  }
                  money
                  note="12 × latest RevenueCat MRR · excludes web Stripe"
                />
                <Card
                  label={b ? "Live Stripe subscribers" : "Paying subscribers"}
                  value={b?.stripe_active_subscribers ?? value("subscribers")}
                  note={b ? "Stripe only · excludes iOS" : dated("subscribers")}
                />
                <Card
                  label={b ? "Live Stripe trials" : "Active trials"}
                  value={b?.stripe_trial_subscribers ?? value("trials")}
                  note={b ? "Stripe only · excludes iOS" : dated("trials")}
                />
              </div>
              <Chart
                title="Monthly recurring revenue (GBP)"
                money
                note="RevenueCat daily MRR in GBP. Web Stripe and Apple estimated proceeds are separate."
                points={points("mrr_gbp")}
              />
              {data && <BillingHistory data={data} dates={dates} />}
              <div className="ah-kpis">
                <Card
                  label="New subscriptions"
                  value={total("new_subscribers")}
                  note={coverage("new_subscribers")}
                />
                <Card
                  label="Renewals"
                  value={total("renewals")}
                  note={coverage("renewals")}
                />
                <Card
                  label="Cancellations"
                  value={total("cancellations")}
                  note={coverage("cancellations")}
                />
                <Card
                  label="Refunded units"
                  value={total("refunds")}
                  note={coverage("refunds")}
                />
              </div>
              <section className="ah-panel">
                <h2>Apple estimated proceeds</h2>
                <p className="ah-note">
                  After Apple commission and applicable taxes. Currencies remain
                  separate. Totals cover only reported days, not a complete
                  period unless every day is present.
                </p>
                <div className="ah-kpis">
                  {[
                    ...new Set(
                      rows.flatMap((d) => Object.keys(d.proceeds ?? {})),
                    ),
                  ].map((c) => (
                    <Card
                      key={c}
                      label={c}
                      value={rows.reduce(
                        (n, d) => n + (d.proceeds?.[c] ?? 0),
                        0,
                      )}
                      note={`${rows.filter((d) => d.proceeds !== undefined).length}/${days} report days · estimated proceeds`}
                    />
                  ))}
                  {!rows.some((d) => d.proceeds) && (
                    <p>No Apple proceeds reports yet.</p>
                  )}
                </div>
              </section>
            </>
          )}
          {section === "content" && (
            <>
              <div className="ah-kpis">
                <Card
                  label="Published posts"
                  value={data ? published.length : null}
                  note={`Last ${days} complete days`}
                />
                <Card
                  label="Drafts"
                  value={data?.posts.filter((p) => p.status === "draft").length}
                  note="Current review queue"
                />
                <Card
                  label="Approved"
                  value={
                    data?.posts.filter((p) => p.status === "approved").length
                  }
                  note="Current approved queue"
                />
                <Card
                  label="Connected channels"
                  value={data?.channels.length}
                  note="App-specific TikTok accounts"
                />
              </div>
              <Chart
                title="Publishing rhythm"
                note="Posts published through JARVIS per day."
                points={postPoints}
              />
              <section className="ah-panel">
                <div className="ah-panel-head">
                  <h2>Post performance</h2>
                  <Link to={`/queue?app=${app}`}>Review queue ↗</Link>
                </div>
                <p className="ah-note">
                  Latest sampled lifetime metrics per post; not views earned in
                  the selected period. No installs are inferred.
                </p>
                <div className="ah-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Post</th>
                        <th>Views</th>
                        <th>Likes</th>
                        <th>Shares</th>
                        <th>Comments</th>
                        <th>Captured</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPosts.slice(0, 20).map((p) => (
                        <tr key={`${p.account_id}/${p.tiktok_post_id}`}>
                          <td>
                            {data?.posts.find((a) => a.id === p.artifact_id)
                              ?.hook ?? `TikTok ${p.tiktok_post_id}`}
                          </td>
                          <td>{fmt(p.views)}</td>
                          <td>{fmt(p.likes)}</td>
                          <td>{fmt(p.shares)}</td>
                          <td>{fmt(p.comments)}</td>
                          <td>{p.captured_at.slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!topPosts.length && <p>No post analytics collected yet.</p>}
                </div>
              </section>
              {data?.channels.map((c) => (
                <Chart
                  key={c.id}
                  title={`@${c.handle} · followers`}
                  note={`Follower snapshots · channel status: ${c.status}`}
                  points={dates.map((date) => ({
                    date,
                    value:
                      data.snapshots.find(
                        (s) =>
                          s.account_id === c.id &&
                          s.captured_at.startsWith(date),
                      )?.followers ?? null,
                  }))}
                />
              ))}
              <section className="ah-panel">
                <h2>App automation controls</h2>
                {data?.automations.map((a) => (
                  <div className="ah-operation" key={a.id}>
                    <div>
                      <strong>{a.name}</strong>
                      <p>
                        {a.enabled ? a.status : "Paused"} · {a.failure_streak}{" "}
                        consecutive failures
                      </p>
                    </div>
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        void action(a.id, () =>
                          api(`/automations/${a.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ enabled: !a.enabled }),
                          }),
                        )
                      }
                    >
                      {a.enabled ? "Pause" : "Resume"}
                    </button>
                  </div>
                ))}
                {data?.automations.length === 0 && (
                  <p>Shared publishing agents are managed in JARVIS.</p>
                )}
                <Link to="/">Open JARVIS controls →</Link>
              </section>
            </>
          )}
          {section === "sources" && (
            <Connections app={app} data={data} onChange={refresh} />
          )}
          <footer className="ah-footer">
            <span>{name} HQ · INSIDE JARVIS</span>
            <span>
              Missing data stays unknown. Source coverage comes first.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
