export default function OperationsLoading() {
  return (
    <div className="animate-pulse space-y-7 pb-12" aria-label="Loading Operations command center">
      <div className="h-48 rounded-3xl bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-32 rounded-2xl bg-gray-100" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
        <div className="h-[460px] rounded-3xl bg-gray-100" />
        <div className="h-[460px] rounded-3xl bg-gray-100" />
      </div>
    </div>
  )
}
