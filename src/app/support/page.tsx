import type { Metadata } from 'next';
import InfoPage from '@/components/InfoPage';
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Support',
  description: `Contact the ${SITE_NAME} support team for help with claims, payouts, PTC ads and shortlinks.`,
};

export default function SupportPage() {
  return (
    <InfoPage
      title="Support & Contact"
      description="We are here to help with payouts, claims and everything in between."
    >
      <div className="rounded-2xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 p-6 text-center">
        <span className="text-3xl">✉️</span>
        <h2 className="!mt-3">Email Support</h2>
        <p>
          The fastest way to reach us is by email. We typically reply within
          24–48 hours.
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-4 inline-block rounded-lg bg-gradient-to-r from-yellow-400 to-orange-500 px-6 py-2.5 font-semibold text-sm text-white hover:opacity-90 transition-opacity"
        >
          {SUPPORT_EMAIL}
        </a>
      </div>

      <h2>Before you write</h2>
      <ul>
        <li><strong>Payout missing?</strong> Verify you used the exact FaucetPay email and check your FaucetPay transaction history first.</li>
        <li><strong>Claim rejected?</strong> Check the cooldown (5 minutes) and your daily limit shown on the faucet tab.</li>
        <li><strong>Shortlink not credited?</strong> Complete every step of the shortlink without closing pages early.</li>
      </ul>

      <h2>What to include</h2>
      <ul>
        <li>Your FaucetPay email address</li>
        <li>Approximate date and time of the issue</li>
        <li>What you expected vs. what happened (a screenshot helps)</li>
      </ul>

      <h2>Business &amp; advertisers</h2>
      <p>
        Interested in advertising on {SITE_NAME} or reporting an issue with an ad
        placement? Use the same email address with the subject line
        &quot;Advertising&quot; or &quot;Ad Report&quot;.
      </p>
    </InfoPage>
  );
}
