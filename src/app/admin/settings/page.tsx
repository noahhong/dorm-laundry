import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { AssistantProviderForm } from "@/components/admin/assistant-provider-form";
import { ChatGPTForm } from "@/components/admin/chatgpt-form";
import { canUseChatGPT, chatGPTSummary, chatGPTModels } from "@/lib/chatgpt-server";
import { ApiKeyForm } from "@/components/admin/api-key-form";
import { ResetDefaults, SettingsForm } from "@/components/admin/settings-form";
import { requireAdmin } from "@/lib/admin-auth";
import { getProviderKey, keyHint } from "@/lib/api-key";
import { getConfig } from "@/lib/config-server";

export const metadata: Metadata = { title: "Admin · Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ chatgpt?: string }> }) {
  await requireAdmin();
  const config = await getConfig();
  const anthropic = await getProviderKey("anthropic");
  const openai = await getProviderKey("openai");
  const available = await canUseChatGPT();
  const summary = available ? await chatGPTSummary() : { activeId: null, accounts: [], connected: false, model: null };
  let models: { id: string; name: string }[] = [];
  let modelError: string | undefined;
  if (available && summary.connected) {
    try { models = await chatGPTModels(); } catch { modelError = "Couldn't load models. Reconnect your ChatGPT account and check plan usage permission."; }
  }
  const { chatgpt } = await searchParams;
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Every rule the site uses. Changes apply to the public pages immediately and are recorded in the activity log."
        actions={<ResetDefaults />}
      />
      <AssistantProviderForm provider={config.assistantProvider} />
      <ChatGPTForm available={available} {...summary} models={models} status={chatgpt} modelError={modelError} />
      <ApiKeyForm provider="anthropic" source={anthropic.source} hint={anthropic.key ? keyHint(anthropic.key) : null} />
      <ApiKeyForm provider="openai" source={openai.source} hint={openai.key ? keyHint(openai.key) : null} />
      <SettingsForm values={config} />
      <p className="mt-6 text-caption text-text-3">
        Dryer settings and minutes-per-payment are set per room under <b>Rooms &amp; machines</b>. Other deployment secrets (admin password, bot-check keys) stay in environment variables.
      </p>
    </>
  );
}
