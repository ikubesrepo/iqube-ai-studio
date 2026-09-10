function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getInsforgeEnv() {
  const baseUrl = getRequiredEnv("NEXT_PUBLIC_INSFORGE_URL");
  const anonKey = getRequiredEnv("NEXT_PUBLIC_INSFORGE_ANON_KEY");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

  return {
    baseUrl,
    anonKey,
    appUrl,
  };
}
