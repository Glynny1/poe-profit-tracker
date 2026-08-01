"use client";

import { useActionState } from "react";
import { login, register, type ActionState } from "@/app/actions";
import { Alert, Button, Input, Label, Panel } from "@/components/ui";

const initial: ActionState = {};

export default function LoginPage() {
  const [loginState, loginAction, loginPending] = useActionState(login, initial);
  const [regState, regAction, regPending] = useActionState(register, initial);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[#c8aa6e]">PoE Profit Tracker</h1>
        <p className="mt-2 text-sm text-[#8b97ad]">
          Snapshot your stash. See what you actually earned, separated from what the market did.
        </p>
      </div>

      <Panel title="Sign in">
        <form action={loginAction} className="space-y-4">
          {loginState.error && <Alert kind="error">{loginState.error}</Alert>}
          <div>
            <Label>Username</Label>
            <Input name="username" autoComplete="username" required />
          </div>
          <div>
            <Label>Password</Label>
            <Input name="password" type="password" autoComplete="current-password" required />
          </div>
          <Button variant="primary" type="submit" disabled={loginPending} className="w-full">
            {loginPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Panel>

      <Panel title="Create an account" subtitle="You need the invite code for this instance.">
        <form action={regAction} className="space-y-4">
          {regState.error && <Alert kind="error">{regState.error}</Alert>}
          <div>
            <Label>Invite code</Label>
            <Input name="invite" required />
          </div>
          <div>
            <Label>Username</Label>
            <Input name="username" autoComplete="username" required minLength={3} />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={regPending} className="w-full">
            {regPending ? "Creating..." : "Create account"}
          </Button>
        </form>
      </Panel>

      <p className="text-center text-xs text-[#8b97ad]">
        This product isn&apos;t affiliated with or endorsed by Grinding Gear Games in any way.
      </p>
    </main>
  );
}
