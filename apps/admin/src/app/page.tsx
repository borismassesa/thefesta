const metrics = [
  { label: 'Active vendors', value: '312', badge: 'KYC verified' },
  { label: 'Pending payouts', value: 'TSh 58M', badge: 'Batch ready' },
  { label: 'Open support tickets', value: '24', badge: 'Needs review' },
  { label: 'Events this week', value: '47', badge: 'Live' },
];

const tasks = [
  { title: 'Approve new vendors', status: '5 pending' },
  { title: 'Review disputed payments', status: '3 flagged' },
  { title: 'Push content changes to website', status: 'In progress' },
  { title: 'Send rollout announcement', status: 'Draft' },
];

export default function AdminHome() {
  return (
    <main className="page">
      <section className="section hero">
        <div className="hero__copy">
          <span className="pill">
            <span className="pill__dot" />
            Admin console
          </span>
          <h1>Operate vendors, payments, and content in one workspace</h1>
          <p>
            Manage marketplace approvals, payouts, SMS campaigns, and the public website from the same monorepo that
            powers the mobile and vendor apps.
          </p>
          <div className="cta">
            <a className="btn btn--primary" href="#">
              Open dashboards
            </a>
            <a className="btn btn--ghost" href="#">
              View audit trails
            </a>
          </div>
        </div>
        <div className="grid">
          {metrics.map(metric => (
            <div className="card" key={metric.label}>
              <div className="card__title">
                <span>{metric.label}</span>
                <span className="badge">{metric.badge}</span>
              </div>
              <span className="metric">{metric.value}</span>
              <span className="card__meta">Realtime snapshot</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="card__title" style={{ marginBottom: 10 }}>
          <span>Operations queue</span>
          <span className="note">Keep admins focused on today&apos;s actions</span>
        </div>
        <ul className="list">
          {tasks.map(task => (
            <li className="list__item" key={task.title}>
              <span>{task.title}</span>
              <span className="badge">{task.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
