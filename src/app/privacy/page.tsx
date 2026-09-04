import type { Metadata } from 'next';
import InfoPage from '@/components/InfoPage';
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `Privacy Policy for ${SITE_NAME} — what data we collect, why we collect it, and your rights.`,
};

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy Policy"
      description="Last updated: February 2026"
    >
      <p>
        This Privacy Policy explains how {SITE_NAME} collects, uses and protects
        your information when you use the Service.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>FaucetPay email address</strong> — required to identify your account and deliver payouts. It is stored in our database.</li>
        <li><strong>Referral data</strong> — if you sign up through a referral link, we record the referring user&apos;s address.</li>
        <li><strong>Technical data</strong> — IP address and browser user-agent, used strictly for anti-fraud (rate limiting and abuse detection).</li>
        <li><strong>Claim activity</strong> — timestamps of your claims, ad views and shortlink completions.</li>
      </ul>

      <h2>2. What We Do NOT Collect</h2>
      <p>
        We never ask for passwords, private keys, seed phrases or payment card
        details. We do not create traditional user accounts — there is no password
        to steal.
      </p>

      <h2>3. How We Use Your Information</h2>
      <ul>
        <li>To process rewards and send payouts via FaucetPay.</li>
        <li>To enforce claim limits, cooldowns and anti-cheat protections.</li>
        <li>To operate the referral program.</li>
      </ul>

      <h2>4. Cookies &amp; Local Storage</h2>
      <p>
        We use browser local storage to remember your FaucetPay email and daily
        progress on your device. Third-party ad networks shown on the Service
        (e.g. Adsterra, A-ADS) may set their own cookies; see their respective
        policies for details.
      </p>

      <h2>5. Data Sharing</h2>
      <p>
        We do not sell your personal data. Payout information is shared with
        FaucetPay solely to deliver your rewards. Aggregate, non-identifying
        statistics may be displayed publicly on the site.
      </p>

      <h2>6. Data Retention &amp; Your Rights</h2>
      <p>
        Claim and fraud-prevention logs are retained for operational and security
        purposes. To request deletion of your FaucetPay email from our records,
        contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update this policy from time to time; the date above reflects the
        latest revision.
      </p>
    </InfoPage>
  );
}
