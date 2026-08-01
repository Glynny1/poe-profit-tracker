import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Panel } from "@/components/ui";
import { ImportForm } from "@/components/ImportForm";
import { TabPicker } from "@/components/TabPicker";
import { StashUrlHelper } from "@/components/StashUrlHelper";

export default async function SetupPage() {
  const user = await requireUser();

  const tabs = await prisma.trackedTab.findMany({
    where: { userId: user.id, league: user.league },
    orderBy: { name: "asc" },
  });

  const staged = await prisma.stagedImport.findUnique({ where: { userId: user.id } });
  const stagedTabs = (staged?.tabs as unknown as { tabId: string; items: unknown[] }[]) ?? [];
  const itemCounts = new Map(stagedTabs.map((t) => [t.tabId, t.items?.length ?? 0]));

  return (
    <div className="space-y-6">
      <Panel
        title="Import your stash"
        subtitle="Paste the JSON from a stash API response, or upload it as a file."
      >
        <ImportForm />
      </Panel>

      <Panel
        title="Build your stash URL"
        subtitle="Type your account name normally — the tricky encoding is handled for you."
      >
        <StashUrlHelper account={user.poeAccount ?? ""} league={user.league} />
      </Panel>

      <Panel
        title="Which tabs count?"
        subtitle="Only ticked tabs are valued and diffed. Changing this later won't break your history — the difference is reported as a coverage change, not as profit."
      >
        {tabs.length === 0 ? (
          <p className="text-sm text-[#8b97ad]">Import some JSON first and your tabs appear here.</p>
        ) : (
          <TabPicker
            tabs={tabs.map((t) => ({
              id: t.gggTabId,
              name: t.name,
              type: t.type,
              isTracked: t.isTracked,
              items: itemCounts.get(t.gggTabId) ?? 0,
            }))}
          />
        )}
      </Panel>
    </div>
  );
}
