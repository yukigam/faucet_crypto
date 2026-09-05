'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Calculator, ShieldCheck, Sparkles } from 'lucide-react';

function fmtAmount(n: number): string {
  return n.toFixed(5);
}

type Challenge = {
  a: number;
  b: number;
  answer: number;
};

type MathCaptchaProps = {
  /** Optional reward shown so the user knows what they are about to earn. */
  reward?: number;
  currency?: string;
  /** Called immediately once the correct answer is submitted. */
  onSolve: () => void;
};

/**
 * Clean, dependency-free in-house captcha modal. Generates a simple two-term
 * addition challenge locally and only calls `onSolve` when the submitted
 * value matches. Rendering it as a blocking overlay right before the verify
 * call gives a lightweight anti-bot gate without shipping any extra SDKs.
 */
export default function MathCaptcha({
  reward,
  currency = 'TON',
  onSolve,
}: MathCaptchaProps) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [solved, setSolved] = useState(false);

  // Build a fresh challenge on mount. Math.random is impure (can't run during
  // render) and setState can't be called synchronously in an effect, so the
  // generation is deferred in a macrotask to satisfy both rules.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const x = 2 + Math.floor(Math.random() * 9); // 2..10
      const y = 1 + Math.floor(Math.random() * 9); // 1..9
      setChallenge({ a: x, b: y, answer: x + y });
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const submit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const parsed = Number(value);
      if (challenge && Number.isFinite(parsed) && parsed === challenge.answer) {
        setSolved(true);
        onSolve();
      } else {
        setError(true);
      }
    },
    [value, challenge, onSolve],
  );

  if (!challenge) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Verification required"
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-emerald-400">
          <ShieldCheck className="w-6 h-6" />
          <h3 className="text-lg font-bold text-white">Quick verification</h3>
        </div>

        <p className="mt-2 text-sm text-gray-300">
          You&apos;re almost done. Solve the math problem below to confirm
          you&apos;re not a bot and receive your reward.
        </p>

        {reward !== undefined && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="font-extrabold text-emerald-300">
              +{fmtAmount(reward)} {currency}
            </span>
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="flex items-center justify-center gap-2 rounded-lg bg-gray-800 py-3 text-2xl font-black tabular-nums text-white">
            <Calculator className="w-5 h-5 text-gray-400" />
            <span>{challenge.a}</span>
            <span className="text-gray-400">+</span>
            <span>{challenge.b}</span>
            <span className="text-gray-400">=</span>
            <span className="text-emerald-400">?</span>
          </div>

          <input
            autoFocus
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/[^0-9]/g, ''));
              setError(false);
            }}
            placeholder="Your answer"
            className={`w-full rounded-lg border bg-gray-800 px-4 py-2.5 text-center text-lg font-bold text-white outline-none transition-colors focus:ring-2 ${
              error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-600 focus:border-transparent focus:ring-emerald-500'
            }`}
          />

          {error && (
            <p className="text-center text-xs font-semibold text-red-400">
              Incorrect answer — please try again.
            </p>
          )}

          <button
            type="submit"
            disabled={solved}
            className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {solved ? 'Verified — claiming…' : 'Verify & Claim Reward'}
          </button>
        </form>
      </div>
    </div>
  );
}