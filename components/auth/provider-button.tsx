import type { OAuthProvider } from "@/lib/auth/types";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M21.8 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.5a4.8 4.8 0 0 1-2 3.1v2.6h3.2c1.9-1.8 3.1-4.4 3.1-7.4Z" fill="#4285F4" />
      <path d="M12 22c2.7 0 5-1 6.7-2.6l-3.2-2.6c-.9.6-2 .9-3.5.9-2.7 0-4.9-1.8-5.7-4.3H3v2.7A10 10 0 0 0 12 22Z" fill="#34A853" />
      <path d="M6.3 13.4A6 6 0 0 1 6 12c0-.5.1-1 .3-1.4V7.9H3A10 10 0 0 0 2 12c0 1.6.4 3.1 1 4.1l3.3-2.7Z" fill="#FBBC04" />
      <path d="M12 6.3c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.9 9.9 0 0 0 12 2 10 10 0 0 0 3 7.9l3.3 2.7C7.1 8.1 9.3 6.3 12 6.3Z" fill="#EA4335" />
    </svg>
  );
}

function XMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.9 3H22l-6.8 7.7L23 21h-6.1l-4.8-6.2L6.6 21H3.5l7.3-8.3L1.4 3h6.3l4.3 5.7L18.9 3Zm-1.1 16h1.7L6.7 4.9H4.9L17.8 19Z" />
    </svg>
  );
}

export function ProviderMark({ provider }: { provider: OAuthProvider }) {
  if (provider === "google") {
    return <GoogleMark />;
  }

  if (provider === "x") {
    return <XMark />;
  }

  return (
    <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
      {provider[0]?.toUpperCase()}
    </span>
  );
}
