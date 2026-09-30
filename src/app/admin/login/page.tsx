import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Page } from "@/components/chrome";
import { StatefulForm, SubmitButton } from "@/components/admin/forms";
import { adminConfigured, isAdmin } from "@/lib/admin-auth";
import { login } from "../actions";
import { card, input, label } from "../styles";

export const metadata: Metadata = { title: "Admin login", robots: { index: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <Page>
      <div className={`${card} mx-auto mt-10 max-w-sm`}>
        <h1 className="text-title">Admin</h1>
        {adminConfigured() ? (
          <StatefulForm action={login} className="mt-4 grid gap-3">
            <label className={label}>
              Password
              <input name="password" type="password" autoComplete="current-password" required className={input} autoFocus />
            </label>
            <SubmitButton>Log in</SubmitButton>
          </StatefulForm>
        ) : (
          <p className="mt-2 text-label text-text-2">
            Admin is disabled. Set <code>ADMIN_PASSWORD</code> (12+ characters) and <code>SESSION_SECRET</code> (32+ random characters) in the environment and restart.
          </p>
        )}
      </div>
    </Page>
  );
}
