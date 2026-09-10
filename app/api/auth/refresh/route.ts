import { createRefreshAuthRouter } from "@insforge/sdk/ssr";

import { getInsforgeEnv } from "@/lib/insforge/env";

const { baseUrl, anonKey } = getInsforgeEnv();

export const { POST } = createRefreshAuthRouter({
  baseUrl,
  anonKey,
});
