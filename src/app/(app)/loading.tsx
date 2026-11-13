// Shown the instant a page is opened, while its data loads.
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/3 animate-[slide_1s_ease-in-out_infinite] rounded-full bg-accent" />
      </div>
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface" />
    </div>
  );
}
