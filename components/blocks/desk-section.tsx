import type { ReactNode } from "react";

/**
 * Quiet one-job section used by Desk and Analytics.
 */
export function DeskSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-neutral-200/70 pt-5 first:border-t-0 first:pt-0 dark:border-neutral-800">
      <div>
        <h2 className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">{title}</h2>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Empty-state copy for surfaces waiting on wallet, partner env, or fills.
 */
export function DeskEmpty({ children }: { readonly children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-neutral-500">{children}</p>;
}

/**
 * Definition list row for personal-book fields.
 */
export function DeskField({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd
        className={
          mono
            ? "min-w-0 truncate text-right font-mono text-neutral-800 dark:text-neutral-200"
            : "min-w-0 truncate text-right text-neutral-800 dark:text-neutral-200"
        }
      >
        {value}
      </dd>
    </div>
  );
}
