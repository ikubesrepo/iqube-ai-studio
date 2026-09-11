import "server-only";

import { createAdminClient } from "@insforge/sdk";

import { getInsforgeEnv } from "@/lib/insforge/env";

export function createInsforgeAdminClient() {
  const { baseUrl } = getInsforgeEnv();

  return createAdminClient({
    baseUrl,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}
