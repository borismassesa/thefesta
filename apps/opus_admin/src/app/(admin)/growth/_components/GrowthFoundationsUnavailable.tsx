import SetGrowthHeading from './SetGrowthHeading'

export default function GrowthFoundationsUnavailable({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading title={title} subtitle={subtitle} />
      <div
        role="status"
        className="border-y border-amber-200 bg-amber-50 px-4 py-5 text-[12px] text-amber-950"
      >
        <h2 className="text-[14px] font-semibold">Canonical Growth data is not available</h2>
        <p className="mt-1 max-w-3xl leading-5">
          Growth foundations have not been enabled for this environment. Existing Growth Tracker data is unchanged.
        </p>
      </div>
    </div>
  )
}
