
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nwxysvbomnbgngpwjsxh.supabase.co';
const supabaseKey = 'sb_publishable_I9KqFIM8wc7VdC-T4-kPVA_ixHj_-PZ';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Fix: explicitly cast the result of response.blob() to solve the 'unknown' assignment error
export const uploadPartImage = async (base64Data: string, fileName: string) => {
  try {
    // Converter base64 para Blob
    const base64Response = await fetch(base64Data);
    // Explicitly cast to Blob as response.blob() can return unknown depending on the TS configuration
    const blob = (await base64Response.blob()) as Blob;

    const filePath = `${Date.now()}_${fileName}.jpg`;

    const { data, error } = await supabase.storage
      .from('part-images')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;
    
    const { data: urlData } = supabase.storage
      .from('part-images')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (err) {
    console.error("Storage upload error:", err);
    throw err;
  }
};
