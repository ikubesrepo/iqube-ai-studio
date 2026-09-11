import type { LucideIcon } from "lucide-react";
import { VideoIcon, UserRoundIcon, SparklesIcon, MicIcon, LibraryIcon } from "lucide-react";

export type DashboardFeature = {
  slug: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  media: { type: "image" | "video"; src: string };
};

export const DASHBOARD_FEATURES: DashboardFeature[] = [
  {
    slug: "ai-video-agent",
    href: "/dashboard/ai-video-agent",
    label: "AI Video Agent",
    description: "Autonomous agents that script, shoot, and edit video end-to-end.",
    icon: VideoIcon,
    media: { type: "video", src: "/ai-video-agent.mp4" },
  },
  {
    slug: "ai-video-avatar",
    href: "/dashboard/ai-video-avatar",
    label: "AI Video Avatar",
    description: "Lifelike talking-head avatars generated from a script or voice.",
    icon: SparklesIcon,
    media: { type: "video", src: "/ai-avatar.mp4" },
  },
  {
    slug: "avatar",
    href: "/dashboard/avatar",
    label: "Avatar",
    description: "Design and manage reusable digital avatars for your brand.",
    icon: UserRoundIcon,
    media: { type: "video", src: "/avatar.mp4" },
  },
  {
    slug: "ai-voice-cloning",
    href: "/dashboard/ai-voice-cloning",
    label: "AI Voice Cloning",
    description: "Clone and generate natural voices from a short sample.",
    icon: MicIcon,
    media: { type: "image", src: "/voice-cloning.png" },
  },
  {
    slug: "my-library",
    href: "/dashboard/my-library",
    label: "My Library",
    description: "All your generated videos, avatars, and voices in one place.",
    icon: LibraryIcon,
    media: { type: "video", src: "/my-library.mp4" },
  },
];
