import { supabase } from "./supabaseClient";

export async function getUserInterests(userId: string) {
  const { data, error } = await supabase
    .from("user_interests")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error;


  return data || { sports: 0.5, technology: 0.5, national: 0.5, international: 0.5 };
}

export async function updateUserInterests(userId: string, newInterests: Record<string, number>) {
  const { error } = await supabase
    .from("user_interests")
    .upsert({ user_id: userId, ...newInterests }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function getUserPreferences(userId: string) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
}
