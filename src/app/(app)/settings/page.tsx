import { requireUser } from "@/lib/session";
import { Panel } from "@/components/ui";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <Panel title="Settings">
      <SettingsForm
        user={{
          poeAccount: user.poeAccount ?? "",
          league: user.league,
          displayCurrency: user.displayCurrency,
          liquidityHaircutPct: user.liquidityHaircutPct,
          minCount: user.minCount,
        }}
      />
    </Panel>
  );
}
