import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { ProjectCard } from "@/components/dashboard/video-agent/project-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/utils";
import { createInsforgeServerClient } from "@/lib/insforge/server";

export default async function AiVideoAgentPage() {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const { data: projects } = await client.database
    .from("video_agent_projects")
    .select(
      "id, title, avatar_label, voice_label, aspect_ratio, duration_seconds, b_roll_style, credits_charged, status, error_message, video_url, thumbnail_url, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const allProjects = projects ?? [];

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary/75">AI VIDEO AGENT</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">AI Video Agent</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Fully edited AI videos with an avatar, B-roll, captions, and voiceover.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/dashboard/ai-video-agent/new" />} size="lg">
          <PlusIcon />
          Create Video with AI Agent
        </Button>
      </header>

      {allProjects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="rounded-[calc(var(--radius)*1.5)] border border-dashed border-border/60 bg-card/40 p-10 text-center">
          <p className="text-sm font-semibold text-foreground">No AI Video Agent videos yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Create your first fully-edited AI video with an avatar, B-roll, captions, and voiceover.
          </p>
          <Button className="mt-5" nativeButton={false} render={<Link href="/dashboard/ai-video-agent/new" />}>
            <PlusIcon />
            Create Video with AI Agent
          </Button>
        </div>
      )}
    </div>
  );
}
