export function WeeklySectionHeading({ title }: { title: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-[17px] font-bold tracking-tight text-ink sm:text-lg">
        {title}
      </h2>
      <div
        className="mt-2 h-3 w-full rounded-[2px] border border-[#2f5597] bg-[#4472C4]"
        aria-hidden
      />
    </div>
  )
}
