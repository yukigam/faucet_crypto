import type { Metadata } from 'next';
import InfoPage from '@/components/InfoPage';
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `Terms of Service for ${SITE_NAME} — rules for using the faucet, PTC ads, shortlinks and referral program.`,
};

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms of Service"
      description="Last updated: February 2026"
    >
      <p>
        By using {SITE_NAME} (the &quot;Service&quot;), you agree to these Terms of
        Service. If you do not agree, please do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        {SITE_NAME} is a free rewards platform that lets users earn small amounts of
        cryptocurrency through faucet claims, paid-to-click (PTC) advertisements,
        shortlink tasks and referrals. All payouts are processed via FaucetPay to the
        email address you provide.
      </p>

      <h2>2. Eligibility</h2>
      <ul>
        <li>You must provide a valid FaucetPay email address to receive payouts.</li>
        <li>One account per person. Multiple accounts, VPN/proxy abuse, or any automated access (bots, scripts, emulators) is strictly prohibited.</li>
        <li>We reserve the right to suspend or forfeit rewards of accounts that violate these rules.</li>
      </ul>

      <h2>3. Rewards &amp; Payouts</h2>
      <ul>
        <li>Reward amounts, claim frequencies and daily limits may change at any time without prior notice.</li>
        <li>Payouts are sent through FaucetPay. We are not responsible for FaucetPay outages, delays, or incorrect wallet addresses supplied by you.</li>
        <li>Rewards earned through fraud, bot traffic or manipulation will be voided.</li>
      </ul>

      <h2>4. Advertisements &amp; Third-Party Content</h2>
      <p>
        The Service displays third-party advertisements and shortlinks. We do not
        control and are not responsible for the content, products or services of
        advertisers. Interacting with ads is at your own risk — never enter private
        keys, passwords or payment details on advertiser pages.
      </p>

      <h2>5. Anti-Cheat Enforcement</h2>
      <p>
        The Service uses captcha verification, IP rate limiting and server-side
        timers to prevent abuse. Attempts to circumvent these systems may result in
        permanent blocking and forfeiture of unclaimed rewards.
      </p>

      <h2>6. No Warranty</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind. We
        do not guarantee uninterrupted availability or any minimum earnings.
      </p>

      <h2>7. Changes &amp; Contact</h2>
      <p>
        We may update these Terms at any time; continued use constitutes acceptance.
        Questions? Contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </InfoPage>
  );
}
