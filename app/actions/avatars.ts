"use server";

import { revalidatePath } from "next/cache";
import { auth, tasks } from "@trigger.dev/sdk";

import { createInsforgeServerClient } from "@/lib/insforge/server";
import { requireUser } from "@/lib/auth/utils";

const AVATAR_STYLES = ["podcast", "casual", "3d_cartoon", "stylized"] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];

function isAvatarStyle(value: FormDataEntryValue | null): value is AvatarStyle {
  return typeof value === "string" && (AVATAR_STYLES as readonly string[]).includes(value);
}

async function uploadFile(
  client: Awaited<ReturnType<typeof createInsforgeServerClient>>,
  path: string,
  file: Blob,
) {
  const { data, error } = await client.storage.from("avatars").upload(path, file);

  if (error || !data) {
    throw new Error(error?.message || "Failed to upload image");
  }

  return { url: data.url, key: data.key };
}

export async function uploadAvatarAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const original = formData.get("original");
  const crop16x9 = formData.get("crop16x9");
  const crop9x16 = formData.get("crop9x16");

  if (!(original instanceof Blob) || !(crop16x9 instanceof Blob) || !(crop9x16 instanceof Blob)) {
    throw new Error("Missing image files");
  }

  const stamp = Date.now();
  const [originalUpload, wideUpload, tallUpload] = await Promise.all([
    uploadFile(client, `uploads/${user.id}-${stamp}-original.png`, original),
    uploadFile(client, `uploads/${user.id}-${stamp}-16-9.png`, crop16x9),
    uploadFile(client, `uploads/${user.id}-${stamp}-9-16.png`, crop9x16),
  ]);

  const { error } = await client.database.from("avatars").insert([
    {
      user_id: user.id,
      source: "upload",
      status: "completed",
      source_image_url: originalUpload.url,
      source_image_key: originalUpload.key,
      crop_16_9_url: wideUpload.url,
      crop_16_9_key: wideUpload.key,
      crop_9_16_url: tallUpload.url,
      crop_9_16_key: tallUpload.key,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/avatar");
}

export async function generateAvatarAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const style = formData.get("style");
  const prompt = formData.get("prompt");
  const sourceImage = formData.get("sourceImage");
  const ratios = formData.getAll("ratios").filter((value): value is "16:9" | "9:16" => value === "16:9" || value === "9:16");

  if (!isAvatarStyle(style)) {
    throw new Error("Choose a style before generating.");
  }

  if (ratios.length === 0) {
    throw new Error("Choose at least one aspect ratio.");
  }

  let sourceImageUrl: string | undefined;
  let sourceImageKey: string | undefined;

  if (sourceImage instanceof Blob && sourceImage.size > 0) {
    const upload = await uploadFile(client, `uploads/${user.id}-${Date.now()}-source.png`, sourceImage);
    sourceImageUrl = upload.url;
    sourceImageKey = upload.key;
  }

  const { data: created, error } = await client.database
    .from("avatars")
    .insert([
      {
        user_id: user.id,
        source: "ai",
        status: "pending",
        style,
        prompt: typeof prompt === "string" && prompt.trim() ? prompt.trim() : null,
        source_image_url: sourceImageUrl ?? null,
        source_image_key: sourceImageKey ?? null,
      },
    ])
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message || "Failed to create avatar record");
  }

  const handle = await tasks.trigger("generate-avatar", {
    avatarId: created.id,
    userId: user.id,
    style,
    prompt: typeof prompt === "string" ? prompt.trim() : undefined,
    sourceImageUrl,
    ratios,
  });

  await client.database.from("avatars").update({ trigger_run_id: handle.id }).eq("id", created.id);

  const publicToken = await auth.createPublicToken({
    scopes: { read: { runs: [handle.id] } },
    expirationTime: "1h",
  });

  return { avatarId: created.id as string, runId: handle.id, publicToken };
}

export async function getAvatarStatusAction(avatarId: string) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const { data, error } = await client.database
    .from("avatars")
    .select("id, status, error_message, crop_16_9_url, crop_9_16_url")
    .eq("id", avatarId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Avatar not found");
  }

  revalidatePath("/dashboard/avatar");

  return data;
}

export async function deleteAvatarAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const avatarId = formData.get("avatarId");

  if (typeof avatarId !== "string" || !avatarId) {
    throw new Error("No avatar specified");
  }

  const { data: avatar, error: fetchError } = await client.database
    .from("avatars")
    .select("source_image_key, crop_16_9_key, crop_9_16_key")
    .eq("id", avatarId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !avatar) {
    throw new Error(fetchError?.message || "Avatar not found");
  }

  const keys = [avatar.source_image_key, avatar.crop_16_9_key, avatar.crop_9_16_key].filter(
    (key): key is string => Boolean(key),
  );

  if (keys.length > 0) {
    await client.storage.from("avatars").remove(keys);
  }

  const { error: deleteError } = await client.database.from("avatars").delete().eq("id", avatarId).eq("user_id", user.id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  revalidatePath("/dashboard/avatar");
}

export async function setActiveAvatarAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const avatarId = formData.get("avatarId");
  const defaultSrc = formData.get("defaultSrc");
  const ratioValue = formData.get("ratio");
  const ratio = ratioValue === "16:9" || ratioValue === "9:16" ? ratioValue : null;

  let targetId = typeof avatarId === "string" && avatarId ? avatarId : null;

  if (!targetId && typeof defaultSrc === "string" && defaultSrc) {
    const { data: existing } = await client.database
      .from("avatars")
      .select("id")
      .eq("user_id", user.id)
      .eq("source", "default")
      .eq("source_image_url", defaultSrc)
      .maybeSingle();

    if (existing) {
      targetId = existing.id;
    } else {
      const { data: created, error } = await client.database
        .from("avatars")
        .insert([
          {
            user_id: user.id,
            source: "default",
            status: "completed",
            source_image_url: defaultSrc,
            crop_16_9_url: defaultSrc,
            crop_9_16_url: defaultSrc,
          },
        ])
        .select("id")
        .single();

      if (error || !created) {
        throw new Error(error?.message || "Failed to select default avatar");
      }

      targetId = created.id;
    }
  }

  if (!targetId) {
    throw new Error("No avatar specified");
  }

  await client.database.from("avatars").update({ is_active: false }).eq("user_id", user.id).eq("is_active", true);
  await client.database
    .from("avatars")
    .update(ratio ? { is_active: true, preferred_ratio: ratio } : { is_active: true })
    .eq("id", targetId);

  revalidatePath("/dashboard/avatar");
}
