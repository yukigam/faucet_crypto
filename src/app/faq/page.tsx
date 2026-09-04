import type { Metadata } from 'next';
import InfoPage from '@/components/InfoPage';
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'FAQ',
  description: `Frequently asked questions about ${SITE_NAME}: payouts, FaucetPay, claim timers, daily limits and anti-cheat rules.`,
};

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I get paid?',
    a: 'All rewards are paid instantly to your FaucetPay account. Just enter the FaucetPay email you registered with FaucetPay — no wallet address needed. Funds usually appear in your FaucetPay balance within seconds.',
  },
  {
    q: 'How often can I claim from the faucet?',
    a: 'You can claim once every 5 minutes, up to 10 claims per day. Completing shortlinks adds bonus claims on top of that daily limit.',
  },
  {
    q: 'What are PTC ads?',
    a: 'Paid-to-Click ads are sponsor websites you view for 30–40 seconds. After a verified view you earn a reward. The timer only counts while the tab is visible and focused — switching away pauses it.',
  },
  {
    q: 'Why did my shortlink not credit?',
    a: 'Shortlinks must be completed fully (including any intermediate steps) and verified by the network. If you close the page early or use an ad blocker, the completion cannot be verified and no reward is credited. Wait a few seconds on the final page.',
  },
  {
    q: 'Why do I have to complete a captcha?',
    a: 'Cloudflare Turnstile keeps the faucet fair by blocking bots. Every faucet claim requires a valid captcha token — this protects the reward pool for real users.',
  },
  {
    q: 'Can I use multiple accounts or a VPN?',
    a: 'No. One account per person; VPN/proxy usage, bots, scripts and device emulation are prohibited. Abusive activity is rate-limited, blocked and forfeits rewards.',
  },
  {
    q: 'How does the referral program work?',
    a: 'Share your personal referral link (shown under the faucet after you sign in). When someone uses your link to claim, you earn a bonus from their activity. Referrals are tracked server-side.',
  },
  {
    q: 'My payout did not arrive — what should I do?',
    a: 'Double-check that you entered the exact email registered with FaucetPay. If it is correct and you still have not received funds, contact support with your FaucetPay email and the approximate claim time.',
  },
  {
    q: 'Do you charge fees?',
    a: 'No. The Service is free to use and rewards are paid in full through FaucetPay (FaucetPay may apply its own micro-withdrawal network fees).',
  },
];

export default function FaqPage() {
  return (
    <InfoPage
      title="Frequently Asked Questions"
      description={`Everything you need to know about earning on ${SITE_NAME}.`}
    >
      <div className="space-y-5">
        {FAQS.map((item, i) => (
          <div key={i} className="rounded-2xl bg-gray-900 border border-gray-800 p-5">
            <h2 className="!mt-0">{item.q}</h2>
            <p>{item.a}</p>
          </div>
        ))}
      </div>
      <p>
        Still have a question? Reach us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </InfoPage>
  );
}
