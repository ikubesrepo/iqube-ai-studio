import "server-only";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import type { createInsforgeServerClient } from "@/lib/insforge/server";

const STARTING_BALANCE = 250;

type AnyInsforgeClient = Awaited<ReturnType<typeof createInsforgeServerClient>> | ReturnType<typeof createInsforgeAdminClient>;

export async function ensureUserCredits(userId: string) {
  const admin = createInsforgeAdminClient();

  await admin.database
    .from("user_credits")
    .insert([{ user_id: userId, balance: STARTING_BALANCE }])
    .select("user_id");
}

export async function getCreditsBalance(client: AnyInsforgeClient, userId: string): Promise<number> {
  await ensureUserCredits(userId);

  const { data } = await client.database.from("user_credits").select("balance").eq("user_id", userId).maybeSingle();

  return data?.balance ?? STARTING_BALANCE;
}
