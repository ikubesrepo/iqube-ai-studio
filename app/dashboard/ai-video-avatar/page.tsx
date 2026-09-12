import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { VideoCard } from "@/components/dashboard/video-avatars/video-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/utils";
import { createInsforgeServerClient } from "@/lib/insforge/server";

export default async function AiVideoAvatarPage() {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const { data: videos } = await client.database
    .from("avatar_videos")
    .select(
      "id, title, avatar_label, voice_label, aspect_ratio, duration_seconds, credits_charged, status, error_message, video_url, thumbnail_url, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const allVideos = videos ?? [];

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary/75">AI VIDEO AVATAR</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">AI Video Avatars</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Turn a script, an avatar, and a voice into a talking-head video.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/dashboard/ai-video-avatar/new" />} size="lg">
          <PlusIcon />
          Generate New Avatar Video
        </Button>
      </header>

      {allVideos.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <div className="rounded-[calc(var(--radius)*1.5)] border border-dashed border-border/60 bg-card/40 p-10 text-center">
          <p className="text-sm font-semibold text-foreground">No avatar videos yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Generate your first talking-avatar video from a script, an avatar, and a voice.
          </p>
          <Button className="mt-5" nativeButton={false} render={<Link href="/dashboard/ai-video-avatar/new" />}>
            <PlusIcon />
            Generate New Avatar Video
          </Button>
        </div>
      )}
    </div>
  );
}
