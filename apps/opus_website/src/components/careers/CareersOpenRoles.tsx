'use client';

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  MapPin,
  SlidersHorizontal,
} from 'lucide-react';
import {
  applyHref,
  formatCareerDate,
  groupJobsByDepartment,
  jobUrgency,
  type CareerJob,
} from '@/lib/careers';

const ALL = 'All';
const SAVED_JOBS_KEY = 'opusfesta-saved-jobs';
const SAVED_JOBS_EVENT = 'opusfesta-saved-jobs-change';

function subscribeToSavedJobs(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(SAVED_JOBS_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(SAVED_JOBS_EVENT, callback);
  };
}

function getSavedJobsSnapshot(): string {
  try {
    return window.localStorage.getItem(SAVED_JOBS_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function options(values: string[]): string[] {
  return [ALL, ...[...new Set(values)].sort()];
}

export default function CareersOpenRoles({
  jobs,
  locale,
}: {
  jobs: CareerJob[];
  locale: 'en' | 'sw';
}) {
  const [department, setDepartment] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [employment, setEmployment] = useState(ALL);
  const [workplace, setWorkplace] = useState(ALL);
  const savedSnapshot = useSyncExternalStore(
    subscribeToSavedJobs,
    getSavedJobsSnapshot,
    () => '[]'
  );
  const saved = useMemo(() => {
    try {
      return JSON.parse(savedSnapshot) as string[];
    } catch {
      return [];
    }
  }, [savedSnapshot]);

  const filters = useMemo(
    () => ({
      departments: options(jobs.map((job) => job.department)),
      locations: options(jobs.map((job) => job.location)),
      employment: options(jobs.map((job) => job.employmentType)),
      workplace: options(jobs.map((job) => job.workplaceType)),
    }),
    [jobs]
  );

  const grouped = useMemo(() => {
    const filtered = jobs.filter(
      (job) =>
        (department === ALL || job.department === department) &&
        (location === ALL || job.location === location) &&
        (employment === ALL || job.employmentType === employment) &&
        (workplace === ALL || job.workplaceType === workplace)
    );
    return groupJobsByDepartment(filtered);
  }, [department, employment, jobs, location, workplace]);

  const matches = grouped.reduce(
    (total, [, departmentJobs]) => total + departmentJobs.length,
    0
  );

  function toggleSaved(id: string) {
    const next = saved.includes(id)
      ? saved.filter((savedId) => savedId !== id)
      : [...saved, id];
    try {
      window.localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SAVED_JOBS_EVENT));
    } catch {
      // Keep the in-memory state even when local storage is unavailable.
    }
  }

  function resetFilters() {
    setDepartment(ALL);
    setLocation(ALL);
    setEmployment(ALL);
    setWorkplace(ALL);
  }

  return (
    <section
      id="open-roles"
      className="scroll-mt-24 border-t border-black/10 bg-white"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-24 md:py-32">
        <div className="mb-14 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <span className="mb-7 inline-block rounded-full border border-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
              Open roles
            </span>
            <h2 className="text-4xl font-medium leading-[1.05] tracking-[-0.04em] md:text-6xl">
              Find the work that feels like yours.
            </h2>
          </div>
          <p className="max-w-sm text-base leading-7 text-black/60 md:text-right">
            {jobs.length} {jobs.length === 1 ? 'role is' : 'roles are'}{' '}
            currently open across our teams.
          </p>
        </div>

        {jobs.length > 0 && (
          <div className="mb-14 rounded-[28px] border border-black/10 bg-[#F4F4F0] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-black/55">
                <SlidersHorizontal className="h-4 w-4" /> Filter roles
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                Reset
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Filter
                label="Department"
                value={department}
                onChange={setDepartment}
                options={filters.departments}
              />
              <Filter
                label="Location"
                value={location}
                onChange={setLocation}
                options={filters.locations}
              />
              <Filter
                label="Employment"
                value={employment}
                onChange={setEmployment}
                options={filters.employment}
              />
              <Filter
                label="Workplace"
                value={workplace}
                onChange={setWorkplace}
                options={filters.workplace}
              />
            </div>
          </div>
        )}

        {matches === 0 ? (
          <div className="rounded-[36px] bg-[#191919] px-7 py-16 text-center text-white md:px-12">
            <p className="mb-3 text-2xl font-medium tracking-tight">
              {jobs.length === 0
                ? 'No open roles right now.'
                : 'Nothing matches those filters.'}
            </p>
            <p className="mx-auto mb-8 max-w-lg leading-7 text-white/65">
              {jobs.length === 0
                ? 'The right timing matters. Join our talent community and we will keep your profile close for the next opening.'
                : 'Reset the filters or join our talent community so we can connect when the right role opens.'}
            </p>
            <Link
              href="/careers/talent-community"
              className="inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-black"
            >
              Join the talent community
            </Link>
          </div>
        ) : (
          <div className="space-y-14">
            {grouped.map(([team, teamJobs]) => (
              <div key={team}>
                <div className="mb-5 flex items-end justify-between border-b border-black/15 pb-4">
                  <h3 className="text-2xl font-medium tracking-tight md:text-3xl">
                    {team}
                  </h3>
                  <span className="text-sm text-black/50">
                    {teamJobs.length.toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="grid gap-3">
                  {teamJobs.map((job) => {
                    const urgency = jobUrgency(job);
                    const isSaved = saved.includes(job.id);
                    return (
                      <article
                        key={job.id}
                        className="group rounded-[24px] border border-black/10 bg-[#F7F7F3] p-5 transition hover:border-black/25 hover:bg-[#F1F0EB] md:p-7"
                      >
                        <div className="flex items-start justify-between gap-5">
                          <Link
                            href={applyHref(job, locale)}
                            className="min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                          >
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              {urgency && (
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${urgency === 'closing-soon' ? 'bg-[#F8D5CF] text-[#7D2318]' : 'bg-[#DDEFCF] text-[#315C20]'}`}
                                >
                                  {urgency === 'closing-soon'
                                    ? 'Closing soon'
                                    : 'New'}
                                </span>
                              )}
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
                                {job.brand}
                              </span>
                            </div>
                            <h4 className="text-xl font-medium tracking-tight md:text-2xl">
                              {job.title}
                            </h4>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
                              {job.summary}
                            </p>
                            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-black/55">
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" />
                                {job.location}
                              </span>
                              <span>{job.workplaceType}</span>
                              <span>{job.employmentType}</span>
                              <span>{job.experienceLevel}</span>
                              {job.closingDate && (
                                <span>
                                  Closes {formatCareerDate(job.closingDate)}
                                </span>
                              )}
                            </div>
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleSaved(job.id)}
                            aria-label={
                              isSaved
                                ? `Remove ${job.title} from saved jobs`
                                : `Save ${job.title}`
                            }
                            aria-pressed={isSaved}
                            className="rounded-full border border-black/15 p-3 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            <Bookmark
                              className={`h-4 w-4 ${isSaved ? 'fill-black' : ''}`}
                            />
                          </button>
                        </div>
                        <Link
                          href={applyHref(job, locale)}
                          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold"
                        >
                          View role{' '}
                          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Filter({
  label,
  value,
  onChange,
  options: filterOptions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium normal-case tracking-normal text-black outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10"
      >
        {filterOptions.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
