import type { ReactNode } from 'react';

/** Простые общие элементы интерфейса панели. */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-400">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink-800 bg-ink-900 ${className}`}>{children}</div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const valueTone =
    tone === 'danger' ? 'text-danger-400' : tone === 'warning' ? 'text-accent-400' : 'text-ink-100';

  return (
    <Card className="p-5">
      <p className="text-sm text-ink-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
}) {
  const tones = {
    neutral: 'border-ink-700 bg-ink-800 text-ink-300',
    success: 'border-brand-600/50 bg-brand-600/15 text-brand-300',
    warning: 'border-accent-500/40 bg-accent-500/10 text-accent-400',
    danger: 'border-danger-500/40 bg-danger-500/10 text-danger-400',
    brand: 'border-brand-500/50 bg-brand-500/15 text-brand-300',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-ink-300">{title}</p>
      {description && <p className="mt-2 text-sm text-ink-500">{description}</p>}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    // Таблица прокручивается внутри своей области: страница не должна
    // ездить вбок на узком экране
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return <th className="border-b border-ink-800 px-5 py-3 font-medium text-ink-400">{children}</th>;
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-ink-800/60 px-5 py-3.5 ${className}`}>{children}</td>;
}
