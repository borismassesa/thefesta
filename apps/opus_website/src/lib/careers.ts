/**
 * Careers page content and pure helpers. Safe to import from Client
 * Components. The Supabase read that backs the open roles list lives in
 * `careers-db.ts` so this module stays free of server-only imports.
 */

export const CAREERS_EMAIL = 'careers@opusfesta.com';

export type CareerJob = {
  id: string;
  slug: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workplaceType: string;
  experienceLevel: string;
  brand: string;
  closingDate: string | null;
  openedAt: string;
  summary: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  workingConditions: string[];
  recruitmentProcess: string[];
  showSalary: boolean;
  salaryMinTzs: number | null;
  salaryMaxTzs: number | null;
};

// Canonical OpusFesta departments, in the order we want them listed. Anything
// the DB returns outside this list is appended after these, alphabetically.
export const DEPARTMENT_ORDER = [
  'Technology',
  'UI & UX Design',
  'Marketing & Partnership',
  'Content, Brand and Social Media',
  'Operations',
  'Studio',
  'Finance & Accountings',
  'HR',
  'Founders',
];

/** Groups roles by department, ordered by DEPARTMENT_ORDER. */
export function groupJobsByDepartment(
  jobs: CareerJob[]
): [string, CareerJob[]][] {
  const groups = new Map<string, CareerJob[]>();
  for (const job of jobs) {
    const bucket = groups.get(job.department);
    if (bucket) bucket.push(job);
    else groups.set(job.department, [job]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ia = DEPARTMENT_ORDER.indexOf(a);
    const ib = DEPARTMENT_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

/** "TZS 1.2M to 1.8M" — compact enough to sit under a role title. */
export function formatSalaryRange(minTzs: number, maxTzs: number): string {
  const compact = (value: number) =>
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
      : `${Math.round(value / 1_000)}K`;
  return minTzs === maxTzs
    ? `TZS ${compact(minTzs)}`
    : `TZS ${compact(minTzs)} to ${compact(maxTzs)}`;
}

export function applyHref(job: CareerJob, locale?: 'en' | 'sw'): string {
  return `/careers/jobs/${job.slug}${locale ? `?lang=${locale}` : ''}`;
}

export function formatCareerDate(value: string): string {
  return new Intl.DateTimeFormat('en-TZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

export function jobUrgency(job: CareerJob): 'new' | 'closing-soon' | null {
  if (job.closingDate) {
    const remaining =
      new Date(`${job.closingDate}T23:59:59`).getTime() - Date.now();
    if (remaining >= 0 && remaining <= 7 * 86_400_000) return 'closing-soon';
  }
  const age = Date.now() - new Date(`${job.openedAt}T00:00:00`).getTime();
  return age >= 0 && age <= 7 * 86_400_000 ? 'new' : null;
}

// ─── Static editorial content ────────────────────────────────────────────

export const CAREERS_PILLARS = [
  {
    id: 'mission',
    eyebrow: 'Our mission',
    copy: 'Make every celebration in Tanzania easy to plan and impossible to forget.',
    bg: '#F6E8F5',
  },
  {
    id: 'vision',
    eyebrow: 'Our vision',
    copy: 'One trusted place where couples, vendors and guests meet, from the first idea to the last dance.',
    bg: '#FDF1D0',
  },
  {
    id: 'foundation',
    eyebrow: 'The foundation',
    copy: 'Care for the couple runs through every decision we make, in code, in copy and on the day itself.',
    bg: '#DDF0E6',
  },
];

export const CAREERS_DNA = [
  {
    id: 'craft',
    eyebrow: 'The north star',
    title: 'Obsessive craft',
    copy: 'We sweat the details nobody asks about. A wedding happens once, so the product that carries it has to feel finished, calm and beautiful.',
  },
  {
    id: 'ground',
    eyebrow: 'The engine',
    title: 'Built on the ground',
    copy: 'We build for Dar es Salaam, Arusha and Zanzibar first. Mobile money, WhatsApp, patchy networks and real venues shape every decision.',
  },
  {
    id: 'ship',
    eyebrow: 'The rigour',
    title: 'Ship, then sharpen',
    copy: 'We put work in front of real couples and vendors quickly, listen hard, and keep refining until it earns its place.',
  },
];

export const CAREERS_VALUES = [
  {
    id: 'trust',
    eyebrow: 'Value 01',
    title: 'Trust is the product',
    copy: 'Vendors stake their livelihood on us and couples stake their day. We protect both, even when it costs us a booking.',
  },
  {
    id: 'clarity',
    eyebrow: 'Value 02',
    title: 'Say the real thing',
    copy: 'Clear pricing, clear feedback, clear timelines. No hedging, internally or with the people we serve.',
  },
  {
    id: 'ownership',
    eyebrow: 'Value 03',
    title: 'Own the whole outcome',
    copy: 'Nobody here stops at the edge of their job title. You carry the problem until the couple actually has what they needed.',
  },
];

export const CAREERS_ACTIONS = [
  {
    id: 'talk',
    eyebrow: 'Every week',
    title: 'Talk to a vendor',
    copy: 'Everyone, engineering included, speaks to vendors and couples. Opinions age quickly without them.',
  },
  {
    id: 'demo',
    eyebrow: 'Every Friday',
    title: 'Show the work',
    copy: 'We demo what shipped that week to the whole team. Rough edges included, because that is where the next fix comes from.',
  },
  {
    id: 'close',
    eyebrow: 'Every day',
    title: 'Close the loop',
    copy: 'Answer the message, log the bug, update the doc. Small loops left open are what slow a season down.',
  },
];
