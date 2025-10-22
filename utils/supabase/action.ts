"use server";
import { createClient } from "./server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { error } : { success: true };
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signUp({ email, password });
  return error ? { error } : { success: true };
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  redirect("/auth/login");
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? { error } : { success: true };
}

export async function updateName(
  userId: string,
  firstName: string,
  lastName: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName.trim(), last_name: lastName.trim() })
    .eq("id", userId);
  return error ? { error } : { success: true };
}

export async function uploadProfilePicture(userId: string, file: File) {
  const supabase = await createClient();

  const fileExt = file.name.split(".").pop();
  const filePath = `${userId}/${Date.now()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from("profile-pictures")
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) return { error: uploadError };
  const { data } = supabase.storage
    .from("profile-pictures")
    .getPublicUrl(filePath);
  const publicUrl = data?.publicUrl;

  const { error: dbError } = await supabase
    .from("profiles")
    .update({ profile_picture: publicUrl })
    .eq("id", userId);
  return dbError ? { error: dbError } : { success: true, url: publicUrl };
}

export async function getUser() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return { error: error.message };
    }
    return data.user;
  } catch (error) {
    // @ts-ignore
    return { error: error.message };
  }
}

export async function request_lock_and_tokens(userId: string) {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("request_lock")
    .select("is_available, tokens_remaining")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[request_lock_and_tokens] select error:", error);
    throw error;
  }

  if (!row) {
    const { data: created, error: insertErr } = await supabase
      .from("request_lock")
      .insert({ user_id: userId, is_available: true, tokens_remaining: 3 })
      .select("is_available, tokens_remaining")
      .single();

    if (insertErr) throw insertErr;
    return {
      is_available: created!.is_available,
      tokens: created.tokens_remaining,
    };
  }

  return { is_available: row.is_available, tokens: row.tokens_remaining };
}

export async function set_request_lock(userId: string) {
  const supabase = await createClient();
  // set the lock
  const { data, error } = await supabase
    .from("request_lock")
    .update({ is_available: false })
    .eq("user_id", userId)
    .eq("is_available", true)
    .select("tokens_remaining")
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  // decrement token
  const { error: decErr } = await supabase
    .from("request_lock")
    .update({ tokens_remaining: data.tokens_remaining - 1 })
    .eq("user_id", userId);

  if (decErr) {
    // prevent a stuck lock if decrement fails
    await supabase
      .from("request_lock")
      .update({ is_available: true })
      .eq("user_id", userId);
    throw decErr;
  }
  return true;
}

export async function release_request_lock(userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("request_lock")
    .update({ is_available: true })
    .eq("user_id", userId);
  if (error) console.error("[release_request_lock] release error:", error);
}
