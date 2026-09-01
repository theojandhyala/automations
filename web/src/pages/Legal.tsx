import { Link } from 'react-router-dom';
import ArcReactorMark from '../components/ArcReactorMark';

const updated = '1 September 2026';

export default function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const privacy = kind === 'privacy';
  return (
    <main className="legal-page jarvis-legal">
      <div className="legal-grid" aria-hidden="true" />
      <header>
        <Link to="/" aria-label="JARVIS home"><ArcReactorMark size={52} /></Link>
        <div><span>J.A.R.V.I.S. AUTOMATION CORE</span><h1>{privacy ? 'Privacy policy' : 'Terms of service'}</h1><p>Last updated {updated}</p></div>
      </header>

      {privacy ? (
        <article>
          <p>This is a private, owner-operated automation dashboard for preparing, reviewing, publishing and measuring content for Cast and Deadset. It is not a public social network and does not sell personal data.</p>
          <h2>Information processed</h2>
          <p>The service processes the owner’s sign-in email, automation settings, creative drafts and uploaded assets. When a TikTok account is connected with consent, it stores the account identifier, encrypted access and refresh tokens, token expiry, public profile basics, account statistics, public post identifiers and engagement metrics. It may also store App Store Connect credentials supplied by the owner, encrypted at rest.</p>
          <h2>How information is used</h2>
          <p>Information is used only to authenticate the owner, run configured automations, display exact media and its provenance, transfer quality-passed posts to the owner’s authorised TikTok accounts, reconcile delivery, and learn which verified product features perform better. Automated publishing is enabled only after TikTok Business approval and can be paused by the owner.</p>
          <h2>Service providers</h2>
          <p>Cloudflare runs the application, rendering and scheduled jobs. Supabase provides authentication and database storage. TikTok handles account consent and publishing. Pexels supplies licensed stock imagery when configured. Apple handles App Store operations when the owner connects App Store Connect.</p>
          <h2>Retention and control</h2>
          <p>The owner can disconnect TikTok access, reject drafts and delete stored content through the connected services or database. TikTok tokens are encrypted before storage. No system can guarantee absolute security, but access is restricted to the configured owner account.</p>
          <h2>Contact</h2>
          <p>Privacy questions or deletion requests: <a href="mailto:theojandhyala@icloud.com">theojandhyala@icloud.com</a>.</p>
        </article>
      ) : (
        <article>
          <p>This private service is provided to help its owner operate Cast and Deadset content workflows. By using it, the owner agrees to follow TikTok, Apple, Pexels and other connected-provider terms and policies.</p>
          <h2>Owner control</h2>
          <p>The owner configures the posting accounts, schedule and permitted content sources. Before automated release, the service applies destination, provenance, truth, quality, privacy and disclosure checks; failed items stay blocked for intervention. The owner remains responsible for the configuration and may pause or reject content at any time.</p>
          <h2>Permitted content</h2>
          <p>Only creator-owned or properly licensed media may be used. Fabricated testimonials, fake results, rebuilt app interfaces, misleading claims, unauthorised personal images and third-party watermarks are not permitted. Product screenshots must reflect the current shipping app.</p>
          <h2>Availability and results</h2>
          <p>Connected platforms may reject, rate-limit, review or remove access at any time. Drafting and analytics are decision-support tools; they do not guarantee views, downloads, revenue or business results.</p>
          <h2>Connected accounts</h2>
          <p>TikTok access is granted through TikTok Business OAuth and may be revoked by the account owner. Public automated posting remains unavailable until TikTok approves the Business Accounts developer integration. App Store operations require separate owner credentials and confirmation.</p>
          <h2>Contact</h2>
          <p>Service questions: <a href="mailto:theojandhyala@icloud.com">theojandhyala@icloud.com</a>.</p>
        </article>
      )}

      <footer><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="https://castfishingapp.com/">Cast</a><a href="https://deadsetfit.org/">Deadset</a></footer>
    </main>
  );
}
