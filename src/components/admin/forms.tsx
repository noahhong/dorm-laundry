"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/admin/actions";

export function StatefulForm({
  action,
  children,
  className = "",
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="text-label font-semibold text-broken-fg">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-label font-semibold text-works-fg">
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", className = "" }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string }) {
  const { pending } = useFormStatus();
  const cls = {
    primary: "bg-accent text-accent-fg",
    secondary: "border border-border bg-surface text-text hover:bg-surface-2",
    danger: "border border-broken-icon/40 bg-broken-tint text-broken-fg",
  }[variant];
  return (
    <button type="submit" disabled={pending} className={`pressable h-11 rounded-[10px] px-4 text-label font-semibold disabled:opacity-50 ${cls} ${className}`}>
      {pending ? "…" : children}
    </button>
  );
}
