import { supabase, supabaseAdmin } from "./supabaseClient";

const PDF_BUCKET = "pdf-digests";
const AUDIO_BUCKET = "audio-digests";

export async function uploadPDFToSupabase(
  pdfBuffer: Uint8Array,
  userId: string,
  fileName: string
): Promise<string> {
  try {
    const storagePath = `${userId}/${fileName}`;

    console.log(`📤 Uploading PDF to Supabase: ${storagePath}`);

    const { data, error } = await supabaseAdmin.storage
      .from(PDF_BUCKET)
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    console.log(`✅ PDF uploaded successfully: ${data.path}`);

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(PDF_BUCKET).getPublicUrl(storagePath);

    return publicUrl;
  } catch (err) {
    console.error("❌ Error uploading PDF to Supabase:", err);
    throw err;
  }
}

export async function uploadAudioToSupabase(
  audioBuffer: Buffer,
  userId: string,
  fileName: string
): Promise<string> {
  try {
    const storagePath = `${userId}/${fileName}`;

    console.log(`📤 Uploading audio to Supabase: ${storagePath}`);

    const { data, error } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    console.log(`✅ Audio uploaded successfully: ${data.path}`);

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(storagePath);

    return publicUrl;
  } catch (err) {
    console.error("❌ Error uploading audio to Supabase:", err);
    throw err;
  }
}

export async function savePDFMetadata(
  userId: string,
  fileName: string,
  publicUrl: string,
  metadata?: {
    articlesCount?: number;
    hasHistorical?: boolean;
    generatedAt?: string;
    fileSizeBytes?: number;
  }
) {
  try {
    console.log(`💾 Saving PDF metadata to database`);

    const { data: existingPdf } = await supabaseAdmin
      .from("pdf_digests")
      .select("id")
      .eq("user_id", userId)
      .eq("file_name", fileName)
      .single();

    if (existingPdf?.id) {
      const { error } = await supabaseAdmin
        .from("pdf_digests")
        .update({
          public_url: publicUrl,
          articles_count: metadata?.articlesCount || 0,
          has_historical: metadata?.hasHistorical || false,
          generated_at: metadata?.generatedAt || new Date().toISOString(),
          file_size_bytes: metadata?.fileSizeBytes || 0,
        })
        .eq("id", existingPdf.id);

      if (error) {
        console.warn(`⚠️ Failed to update metadata: ${error.message}`);
      }
    } else {
      const { error } = await supabaseAdmin.from("pdf_digests").insert({
        user_id: userId,
        file_name: fileName,
        public_url: publicUrl,
        articles_count: metadata?.articlesCount || 0,
        has_historical: metadata?.hasHistorical || false,
        generated_at: metadata?.generatedAt || new Date().toISOString(),
        file_size_bytes: metadata?.fileSizeBytes || 0,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.warn(`⚠️ Failed to save metadata: ${error.message}`);
      }
    }

    console.log(`✅ PDF metadata saved successfully`);
  } catch (err) {
    console.warn("⚠️ Error saving PDF metadata:", err);
  }
}

export async function getUserPDFs(userId: string) {
  try {
    const { data, error } = await supabase
      .from("pdf_digests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch PDFs: ${error.message}`);
    }

    return data || [];
  } catch (err) {
    console.error("❌ Error fetching user PDFs:", err);
    throw err;
  }
}

export async function getLatestUserPDF(userId: string) {
  try {
    const { data, error } = await supabase
      .from("pdf_digests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to fetch latest PDF: ${error.message}`);
    }

    return data || null;
  } catch (err) {
    console.error("❌ Error fetching latest PDF:", err);
    throw err;
  }
}

export async function deletePDF(userId: string, fileName: string) {
  try {
    const storagePath = `${userId}/${fileName}`;

    console.log(`🗑️ Deleting PDF: ${storagePath}`);

    const { error: storageError } = await supabase.storage
      .from(PDF_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      throw new Error(`Failed to delete from storage: ${storageError.message}`);
    }

    const { error: dbError } = await supabase
      .from("pdf_digests")
      .delete()
      .eq("user_id", userId)
      .eq("file_name", fileName);

    if (dbError) {
      throw new Error(`Failed to delete from database: ${dbError.message}`);
    }

    console.log(`✅ PDF deleted successfully`);
  } catch (err) {
    console.error("❌ Error deleting PDF:", err);
    throw err;
  }
}

export async function ensurePDFBucketExists() {
  try {
    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      throw new Error(`Failed to list buckets: ${error.message}`);
    }

    const bucketExists = data?.some((bucket) => bucket.name === PDF_BUCKET);

    if (!bucketExists) {
      console.log(`📦 Creating PDF bucket: ${PDF_BUCKET}`);

      const { error: createError } = await supabase.storage.createBucket(
        PDF_BUCKET,
        {
          public: true,
          fileSizeLimit: 52428800,
        }
      );

      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }

      console.log(`✅ PDF bucket created successfully`);
    } else {
      console.log(`✅ PDF bucket already exists`);
    }
  } catch (err) {
    console.error("❌ Error ensuring PDF bucket:", err);
    throw err;
  }
}

export async function ensureAudioBucketExists() {
  try {
    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      throw new Error(`Failed to list buckets: ${error.message}`);
    }

    const bucketExists = data?.some((bucket) => bucket.name === AUDIO_BUCKET);

    if (!bucketExists) {
      console.log(`📦 Creating audio bucket: ${AUDIO_BUCKET}`);

      const { error: createError } = await supabase.storage.createBucket(
        AUDIO_BUCKET,
        {
          public: true,
          fileSizeLimit: 104857600, // 100MB for audio
        }
      );

      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }

      console.log(`✅ Audio bucket created successfully`);
    } else {
      console.log(`✅ Audio bucket already exists`);
    }
  } catch (err) {
    console.error("❌ Error ensuring audio bucket:", err);
    throw err;
  }
}

// ========== PERSISTENT INTEREST TRACKING ==========

export async function getUserInterestsFromDB(
  userId: string
): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from("user_interests")
      .select("interests_data")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.warn(`⚠️ Failed to fetch interests: ${error.message}`);
      return {
        national: 0.3,
        international: 0.3,
        sports: 0.2,
        technology: 0.2,
        all: 0.5,
      };
    }

    if (!data) {
      return {
        national: 0.3,
        international: 0.3,
        sports: 0.2,
        technology: 0.2,
        all: 0.5,
      };
    }

    return data.interests_data || {};
  } catch (err) {
    console.error("❌ Error fetching user interests:", err);
    return {
      national: 0.3,
      international: 0.3,
      sports: 0.2,
      technology: 0.2,
      all: 0.5,
    };
  }
}

export async function saveUserInterestsToDb(
  userId: string,
  interests: Record<string, number>
): Promise<void> {
  try {
    const { data: existingUser } = await supabase
      .from("user_interests")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existingUser?.id) {
      const { error } = await supabase
        .from("user_interests")
        .update({
          interests_data: interests,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) {
        console.warn(`⚠️ Failed to update interests: ${error.message}`);
      } else {
        console.log(`✅ Updated interests for user ${userId}`);
      }
    } else {
      const { error } = await supabase.from("user_interests").insert({
        user_id: userId,
        interests_data: interests,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn(`⚠️ Failed to save interests: ${error.message}`);
      } else {
        console.log(`✅ Saved interests for user ${userId}`);
      }
    }
  } catch (err) {
    console.error("❌ Error saving user interests:", err);
  }
}

export async function addToBrowsingHistoryDB(
  userId: string,
  articleTitles: string[]
): Promise<void> {
  try {
    const { data: existingHistory } = await supabase
      .from("user_browsing_history")
      .select("article_titles")
      .eq("user_id", userId)
      .single();

    const currentTitles = existingHistory?.article_titles || [];
    const updatedTitles = [...currentTitles, ...articleTitles].slice(-100);

    const { data: existingUser } = await supabase
      .from("user_browsing_history")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existingUser?.id) {
      const { error } = await supabase
        .from("user_browsing_history")
        .update({
          article_titles: updatedTitles,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) {
        console.warn(`⚠️ Failed to update browsing history: ${error.message}`);
      } else {
        console.log(`✅ Updated browsing history for user ${userId}`);
      }
    } else {
      const { error } = await supabase.from("user_browsing_history").insert({
        user_id: userId,
        article_titles: updatedTitles,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn(`⚠️ Failed to save browsing history: ${error.message}`);
      } else {
        console.log(`✅ Saved browsing history for user ${userId}`);
      }
    }
  } catch (err) {
    console.error("❌ Error saving browsing history:", err);
  }
}

export async function getBrowsingHistoryFromDB(
  userId: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("user_browsing_history")
      .select("article_titles")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.warn(`⚠️ Failed to fetch browsing history: ${error.message}`);
      return [];
    }

    return data?.article_titles || [];
  } catch (err) {
    console.error("❌ Error fetching browsing history:", err);
    return [];
  }
}

export async function clearUserData(userId: string): Promise<void> {
  try {
    console.log(`🗑️ Clearing all data for user ${userId}`);

    const { error: interestsError } = await supabase
      .from("user_interests")
      .delete()
      .eq("user_id", userId);

    const { error: historyError } = await supabase
      .from("user_browsing_history")
      .delete()
      .eq("user_id", userId);

    if (interestsError) {
      console.warn(`⚠️ Error clearing interests: ${interestsError.message}`);
    }

    if (historyError) {
      console.warn(`⚠️ Error clearing history: ${historyError.message}`);
    }

    if (!interestsError && !historyError) {
      console.log(`✅ Cleared all user data for ${userId}`);
    }
  } catch (err) {
    console.error("❌ Error clearing user data:", err);
  }
}
