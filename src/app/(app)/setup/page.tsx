import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Alert, Panel } from "@/components/ui";
import { ImportForm } from "@/components/ImportForm";
import { TabPicker } from "@/components/TabPicker";

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

      <Alert>
        <strong>How to get the JSON.</strong> While logged in to pathofexile.com, open{" "}
        <code className="text-[#c8aa6e]">
          https://www.pathofexile.com/character-window/get-stash-items?accountName=YourName%23
          1234&amp;realm=pc&amp;league={user.league}&amp;tabs=1&amp;tabIndex=0
        </code>{" "}
        in your browser and copy the whole response. Increase{" "}
        <code className="text-[#c8aa6e]">tabIndex</code> and paste each tab in turn — imports
        accumulate. The <code className="text-[#c8aa6e]">#</code> in your account name must be
        written as <code className="text-[#c8aa6e]">%23</code>, and{" "}
        <code className="text-[#c8aa6e]">realm=pc</code> is required, or you will get a permission
        error that looks like a login failure.
      </Alert>

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
