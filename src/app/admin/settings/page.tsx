import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { ApiKeyForm } from "@/components/admin/api-key-form";
import { ResetDefaults, SettingsForm } from "@/components/admin/settings-form";
import { requireAdmin } from "@/lib/admin-auth";
import { getAnthropicKey, keyHint } from "@/lib/api-key";
import { getConfig } from "@/lib/config-server";

export const metadata: Metadata = { title: "Admin · Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const config = await getConfig();
  const apiKey = await getAnthropicKey();
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Every rule the site uses. Changes apply to the public pages immediately and are recorded in the activity log."
        actions={<ResetDefaults />}
      />
      <ApiKeyForm source={apiKey.source} hint={apiKey.key ? keyHint(apiKey.key) : null} />
      <SettingsForm values={config} />
      <p className="mt-6 text-caption text-text-3">
        Dryer settings and minutes-per-payment are set per room under <b>Rooms &amp; machines</b>. Other deployment secrets (admin password, bot-check keys) stay in environment variables.
      </p>
    </>
  );
}
