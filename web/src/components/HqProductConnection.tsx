import { useState } from "react";
import { api } from "../lib/supabase";
import type { HqPayload } from "../../../worker/src/lib/hq-contract";
export default function HqProductConnection({
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
      <p className="ah-kicker">LIVE PRODUCT CONNECTION</p>
      <h2>
        {app === "cast"
          ? "Your catches. Your anglers."
          : "Your workouts. Your users."}
      </h2>
      <p className="ah-note">
        Read-only collector for the verified {app.toUpperCase()} production
        database. Collects aggregate activity every five minutes and on Refresh.
        The server key is encrypted and never returned to the browser.
      </p>
      <div className="ah-callout">
        <div>
          <h3>
            {data?.product_configured
              ? "Source configured"
              : "Source key required"}
          </h3>
          <p>
            {data?.product
              ? `Last successful collection: ${new Date(data.product.captured_at).toLocaleString()} · ${data.product.registered_users} profiles`
              : "No successful collection yet."}
          </p>
          {data?.product_status?.error && (
            <p role="alert">{data.product_status.error}</p>
          )}
        </div>
      </div>
      <form
        className="ah-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setNotice("");
          try {
            const result = await api<{ registered_users: number }>(
              `/hq/${app}/product`,
              { method: "PUT", body: JSON.stringify({ key }) },
            );
            setKey("");
            setNotice(
              `Connected and verified: ${result.registered_users} profiles. Charts are refreshing.`,
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
          Production server key
          <input
            type="password"
            autoComplete="off"
            required
            minLength={30}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Supabase secret or service_role key"
          />
        </label>
        <button disabled={busy}>
          {busy
            ? "Verifying source…"
            : data?.product_configured
              ? "Replace source connection"
              : "Connect product database"}
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
