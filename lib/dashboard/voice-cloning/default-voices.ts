export type DefaultVoice = {
  id: string;
  name: string;
  gender: "male" | "female";
  accent?: string;
  description: string;
};

export const DEFAULT_VOICES: DefaultVoice[] = [
  {
    id: "aura-2-asteria-en",
    name: "Asteria",
    gender: "female",
    accent: "American",
    description: "Clear, confident, and energetic for product demos.",
  },
  {
    id: "aura-2-orion-en",
    name: "Orion",
    gender: "male",
    accent: "American",
    description: "Warm and reassuring, great for support and onboarding.",
  },
  {
    id: "aura-2-luna-en",
    name: "Luna",
    gender: "female",
    accent: "American",
    description: "Casual and expressive for natural conversations.",
  },
  {
    id: "aura-2-arcas-en",
    name: "Arcas",
    gender: "male",
    accent: "American",
    description: "Grounded and steady, suited for narration.",
  },
  {
    id: "aura-2-athena-en",
    name: "Athena",
    gender: "female",
    accent: "British",
    description: "Polished and articulate for professional briefings.",
  },
  {
    id: "aura-2-helios-en",
    name: "Helios",
    gender: "male",
    accent: "British",
    description: "Comfortable, measured delivery for explainers.",
  },
];

export const PREVIEW_SAMPLE_TEXT = "Hi, this is a preview of how this voice sounds. I hope you like it!";

export function findDefaultVoice(id: string) {
  return DEFAULT_VOICES.find((voice) => voice.id === id) ?? null;
}
