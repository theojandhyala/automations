import { useState } from "react";
import { api } from "../lib/supabase";
import type { HqPayload } from "../../../worker/src/lib/hq-contract";
export default function HqBillingConnection({
  app,
  data,
  onChange,
}: {
  app: string;
  data: HqPayload | null;
  onChange: () => void;
}) {
  const [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <section className="ah-panel">
      <p className="ah-kicker">LIVE SUBSCRIPTIONS</p>
      <h2>RevenueCat reporting.</h2>
      <p className="ah-note">
        Connect the Charts & Metrics read-only API v2 key for{" "}
        {app.toUpperCase()}. Uses production overview metrics in GBP, checks
        every five minutes and on Refresh. RevenueCat can cache customer metrics
        independently.
      </p>
      <p className="ah-note">
        {data?.billing
          ? `Last successful collection ${new Date(data.billing.captured_at).toLocaleString()} · ${data.billing.project_id}`
          : "No live billing connection yet."}
      </p>
      {data?.billing_status?.error && (
        <p role="alert" className="ah-notice">
          {data.billing_status.error}
        </p>
      )}
      <form
        className="ah-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setNotice("");
          try {
            await api(`/hq/${app}/billing`, {
              method: "PUT",
              body: JSON.stringify({ key }),
            });
            setKey("");
            setNotice(
              "RevenueCat connected. Live billing metrics are refreshing.",
            );
            onChange();
          } catch (e) {
            setNotice(e instanceof Error ? e.message : "Could not connect");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="ah-wide">
          RevenueCat reporting key
          <input
            type="password"
            autoComplete="off"
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk_…"
          />
        </label>
        <button disabled={busy}>
          {busy
            ? "Verifying billing…"
            : data?.billing_configured
              ? "Replace billing connection"
              : "Connect RevenueCat"}
        </button>
      </form>
      {notice && (
        <p role="status" className="ah-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
