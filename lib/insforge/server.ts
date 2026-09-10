import "server-only";

import { createAuthActions, createServerClient } from "@insforge/sdk/ssr";
import { cookies } from "next/headers";

import { getInsforgeEnv } from "@/lib/insforge/env";

export async function createInsforgeServerClient() {
  const cookieStore = await cookies();
  const { baseUrl, anonKey } = getInsforgeEnv();

  return createServerClient({
    baseUrl,
    anonKey,
    cookies: cookieStore,
  });
}

export async function createInsforgeAuthActions() {
  const cookieStore = await cookies();
  const { baseUrl, anonKey } = getInsforgeEnv();

  return createAuthActions({
    baseUrl,
    anonKey,
    cookies: cookieStore,
  });
}
