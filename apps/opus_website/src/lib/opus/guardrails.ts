// High-stakes topic + human-request detection for Opus.
//
// The Air Canada precedent: a chatbot's wrong promise can legally bind the
// company. So for money, cancellations, complaints, legal, and safety topics
// we do NOT let the model improvise a commitment. We escalate to a human and
// return a safe holding message instead of an AI answer.

export type EscalationCheck = {
  escalate: boolean
  topic?: string
  reason?: string
}

// Explicit "talk to a person" intent.
const HUMAN_REQUEST = [
  /\b(talk|speak|chat|connect)\s+(to|with)\s+(a\s+)?(human|person|someone|agent|representative|rep|staff|support|team)\b/i,
  /\b(real|live)\s+(person|human|agent|support)\b/i,
  /\b(human|live)\s+(agent|support|chat)\b/i,
  /\bcustomer\s+(support|service|care)\b/i,
  /\b(agent|representative)\b/i,
]

// High-stakes topics where a wrong AI answer carries real cost/liability.
const HIGH_STAKES: Array<{ topic: string; patterns: RegExp[] }> = [
  {
    topic: 'refund',
    patterns: [/\brefund(s|ed|ing)?\b/i, /\bmoney\s+back\b/i, /\bchargeback\b/i, /\breimburse/i],
  },
  {
    topic: 'cancellation',
    patterns: [/\bcancel(l?ed|l?ing|lation)?\b/i, /\breschedul/i, /\bpostpone/i],
  },
  {
    topic: 'payment',
    patterns: [
      /\b(payment|paid|charge|charged|billing|invoice|deposit)\b/i,
      /\b(m-?pesa|tigo\s*pesa|airtel\s*money|mobile\s+money)\b.*\b(fail|failed|stuck|pending|wrong|didn'?t)\b/i,
      /\b(double|twice)\s+charged\b/i,
      /\bnot\s+received\b/i,
    ],
  },
  {
    topic: 'complaint',
    patterns: [
      /\b(complaint|complain|scam|fraud|report|dispute|angry|terrible|awful|unacceptable)\b/i,
      /\b(legal|lawyer|sue|court|refund my)\b/i,
    ],
  },
  {
    topic: 'account',
    patterns: [/\b(hacked|locked out|can'?t log ?in|delete my account|account.*(hacked|stolen))\b/i],
  },
]

export function checkEscalation(text: string): EscalationCheck {
  const t = text.trim()
  if (!t) return { escalate: false }

  for (const rx of HUMAN_REQUEST) {
    if (rx.test(t)) {
      return { escalate: true, topic: 'human_request', reason: 'Customer asked for a human agent.' }
    }
  }

  for (const { topic, patterns } of HIGH_STAKES) {
    if (patterns.some((rx) => rx.test(t))) {
      return { escalate: true, topic, reason: `High-stakes topic: ${topic}.` }
    }
  }

  return { escalate: false }
}

// Safe holding message returned instead of an AI answer when we escalate.
// `opensNext` / `etaMinutes` let the customer know when to expect a person
// rather than leaving them staring at an open-ended wait.
export function escalationReply(
  check: EscalationCheck,
  opts: { afterHours: boolean; opensNext?: string | null; etaMinutes?: number | null },
): string {
  const intro =
    check.topic === 'human_request'
      ? "Of course, I'll connect you with a member of our team."
      : "This is something our team should help you with directly, so I won't guess. I've flagged it for a person on our support team."

  if (opts.afterHours) {
    const back = opts.opensNext ? ` and the team will follow up ${opts.opensNext}` : ' and the team will follow up as soon as we are back'
    return `${intro} We're offline right now, but leave your email or WhatsApp number${back}.`
  }

  const eta =
    opts.etaMinutes && opts.etaMinutes < 60
      ? ` Someone usually jumps in within ${opts.etaMinutes} minutes.`
      : ' Someone will jump in here shortly.'
  return `${intro}${eta} You can also leave your email or WhatsApp number so we can reach you if you step away.`
}
