import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function SurfaceLoading() {
  return (
    <div aria-label="Loading current data" className="surface-loading" role="status">
      <span />
      <span />
      <span />
      <span />
      <b className="sr-only">Loading current data</b>
    </div>
  );
}

export function SurfaceError({ error, retry }: Readonly<{ error: Error; retry: () => void }>) {
  return (
    <section className="surface-message" role="alert">
      <AlertTriangle aria-hidden="true" />
      <p>
        <b>The signal could not be loaded.</b>
        <span>{error.message}</span>
      </p>
      <button className="button button--small" onClick={retry} type="button">
        <RefreshCw size={15} />
        Try again
      </button>
    </section>
  );
}

export function EmptySurface({
  action,
  body,
  title,
}: Readonly<{ action?: ReactNode; body: string; title: string }>) {
  return (
    <section className="empty-surface">
      <span aria-hidden="true" className="empty-rings">
        <i />
        <i />
        <i />
      </span>
      <p className="eyebrow">Awaiting signal</p>
      <h1>{title}</h1>
      <p>{body}</p>
      {action}
    </section>
  );
}
