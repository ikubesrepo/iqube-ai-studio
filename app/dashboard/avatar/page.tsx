import { AvatarCard } from "@/components/dashboard/avatar/avatar-card";
import { CreateAvatarDialog } from "@/components/dashboard/avatar/create-avatar-dialog";
import { CustomAvatarCard } from "@/components/dashboard/avatar/custom-avatar-card";
import { requireUser } from "@/lib/auth/utils";
import { createInsforgeServerClient } from "@/lib/insforge/server";

const DEFAULT_AVATARS = [
  { src: "/avatars/adam.png", label: "Adam" },
  { src: "/avatars/emma.png", label: "Emma" },
  { src: "/avatars/jack.png", label: "Jack" },
  { src: "/avatars/jen.png", label: "Jen" },
];

export default async function AvatarPage() {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const { data: avatars } = await client.database
    .from("avatars")
    .select(
      "id, source, style, prompt, status, error_message, source_image_url, crop_16_9_url, crop_9_16_url, is_active, preferred_ratio",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const allAvatars = avatars ?? [];
  const customAvatars = allAvatars.filter((avatar) => avatar.source !== "default");
  const activeDefaultSrc = allAvatars.find((avatar) => avatar.source === "default" && avatar.is_active)?.source_image_url;

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary/75">AVATAR</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">Avatars</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your custom avatars or pick a default to get started.</p>
        </div>
        <CreateAvatarDialog />
      </header>

      <section>
        <h2 className="mb-4 font-heading text-lg font-semibold tracking-[-0.02em]">Custom Avatars</h2>
        {customAvatars.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {customAvatars.map((avatar) => (
              <CustomAvatarCard avatar={avatar} key={avatar.id} />
            ))}
          </div>
        ) : (
          <div className="rounded-[calc(var(--radius)*1.5)] border border-dashed border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            You haven&apos;t created any avatars yet. Use &quot;Create New Avatar&quot; to get started.
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 font-heading text-lg font-semibold tracking-[-0.02em]">Default Avatars</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEFAULT_AVATARS.map((avatar) => (
            <AvatarCard
              defaultSrc={avatar.src}
              imageUrl={avatar.src}
              isActive={activeDefaultSrc === avatar.src}
              key={avatar.src}
              label={avatar.label}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
