import { supabase, supabaseAdmin } from "./supabaseClient";

const PDF_BUCKET = "pdf-digests";

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
