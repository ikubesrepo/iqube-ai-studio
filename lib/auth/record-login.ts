import "server-only";

import { createInsforgeServerClient } from "@/lib/insforge/server";

export type LoginProvider = "email" | "google" | "github" | (string & {});

type InsforgeClient = Awaited<ReturnType<typeof createInsforgeServerClient>>;

export async function recordUserLogin(params: {
  client?: InsforgeClient;
  id: string;
  email: string;
  fullName?: string | null;
  provider: LoginProvider;
}) {
  try {
    const client = params.client ?? (await createInsforgeServerClient());

    const { error } = await client.database.from("users").upsert(
      [
        {
          id: params.id,
          email: params.email,
          full_name: params.fullName ?? null,
          provider: params.provider,
          last_login: new Date().toISOString(),
        },
      ],
      { onConflict: "id" },
    );

    if (error) {
      console.error("[recordUserLogin] upsert failed:", error);
    }
  } catch (err) {
    // Never let a DB hiccup block sign-in/sign-up.
    console.error("[recordUserLogin] unexpected failure:", err);
  }
}
