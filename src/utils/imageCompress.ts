/**
 * Client-side Image Compression & Thumbnail Generation Utility
 * Optimized for Supabase Egress reduction and low-bandwidth AI Vision processing
 * 
 * Rules:
 * - Downscales large images to max 1600px on long edge
 * - Re-encodes at ~75% JPEG quality in the browser before upload
 * - Generates a ~400px thumbnail for fast list-view rendering
 * - Emits clear telemetry on bytes saved
 */

export interface ProcessedImageResult {
  fileName: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  thumbnailSizeBytes: number;
  savingsPercentage: number;
  compressedBase64: string;
  compressedBlob: Blob;
  compressedDataUrl: string;
  thumbnailBase64: string;
  thumbnailBlob: Blob;
  thumbnailDataUrl: string;
  mimeType: string;
}

/**
 * Resize and compress an image file using an off-screen HTML5 Canvas
 */
export async function compressAndCreateThumbnail(
  file: File,
  maxDimension = 1600,
  maxThumbnailDimension = 400,
  quality = 0.75
): Promise<ProcessedImageResult> {
  // If it's a PDF or non-image, handle safely without canvas
  if (!file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = (e.target?.result as string) || '';
        const commaIdx = dataUrl.indexOf(',');
        const base64 = commaIdx > -1 ? dataUrl.substring(commaIdx + 1) : dataUrl;
        resolve({
          fileName: file.name,
          originalSizeBytes: file.size,
          compressedSizeBytes: file.size,
          thumbnailSizeBytes: file.size,
          savingsPercentage: 0,
          compressedBase64: base64,
          compressedBlob: file,
          compressedDataUrl: dataUrl,
          thumbnailBase64: base64,
          thumbnailBlob: file,
          thumbnailDataUrl: dataUrl,
          mimeType: file.type || 'application/pdf',
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const origWidth = img.naturalWidth || img.width;
      const origHeight = img.naturalHeight || img.height;

      // 1. Calculate dimensions for compressed full image (max 1600px)
      let fullWidth = origWidth;
      let fullHeight = origHeight;

      if (origWidth > maxDimension || origHeight > maxDimension) {
        if (origWidth > origHeight) {
          fullWidth = maxDimension;
          fullHeight = Math.round((origHeight * maxDimension) / origWidth);
        } else {
          fullHeight = maxDimension;
          fullWidth = Math.round((origWidth * maxDimension) / origHeight);
        }
      }

      // Render full compressed canvas
      const canvasFull = document.createElement('canvas');
      canvasFull.width = fullWidth;
      canvasFull.height = fullHeight;
      const ctxFull = canvasFull.getContext('2d');

      if (!ctxFull) {
        reject(new Error('Failed to get 2D canvas context'));
        return;
      }

      // Smooth rendering
      ctxFull.imageSmoothingEnabled = true;
      ctxFull.imageSmoothingQuality = 'high';
      ctxFull.drawImage(img, 0, 0, fullWidth, fullHeight);

      // Export compressed full image
      const targetMime = 'image/jpeg';
      const compressedDataUrl = canvasFull.toDataURL(targetMime, quality);
      const commaIdxFull = compressedDataUrl.indexOf(',');
      const compressedBase64 = commaIdxFull > -1 ? compressedDataUrl.substring(commaIdxFull + 1) : compressedDataUrl;

      // Convert to blob
      canvasFull.toBlob((blobFull) => {
        if (!blobFull) {
          reject(new Error('Failed to create compressed image blob'));
          return;
        }

        // 2. Calculate dimensions for thumbnail (max 400px)
        let thumbWidth = origWidth;
        let thumbHeight = origHeight;

        if (origWidth > maxThumbnailDimension || origHeight > maxThumbnailDimension) {
          if (origWidth > origHeight) {
            thumbWidth = maxThumbnailDimension;
            thumbHeight = Math.round((origHeight * maxThumbnailDimension) / origWidth);
          } else {
            thumbHeight = maxThumbnailDimension;
            thumbWidth = Math.round((origWidth * maxThumbnailDimension) / origHeight);
          }
        }

        const canvasThumb = document.createElement('canvas');
        canvasThumb.width = thumbWidth;
        canvasThumb.height = thumbHeight;
        const ctxThumb = canvasThumb.getContext('2d');

        if (!ctxThumb) {
          reject(new Error('Failed to get 2D thumbnail context'));
          return;
        }

        ctxThumb.imageSmoothingEnabled = true;
        ctxThumb.imageSmoothingQuality = 'medium';
        ctxThumb.drawImage(img, 0, 0, thumbWidth, thumbHeight);

        const thumbnailDataUrl = canvasThumb.toDataURL(targetMime, 0.7);
        const commaIdxThumb = thumbnailDataUrl.indexOf(',');
        const thumbnailBase64 = commaIdxThumb > -1 ? thumbnailDataUrl.substring(commaIdxThumb + 1) : thumbnailDataUrl;

        canvasThumb.toBlob((blobThumb) => {
          if (!blobThumb) {
            reject(new Error('Failed to create thumbnail blob'));
            return;
          }

          const originalSize = file.size;
          const compressedSize = blobFull.size;
          const thumbnailSize = blobThumb.size;
          const savings = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100));

          resolve({
            fileName: file.name,
            originalSizeBytes: originalSize,
            compressedSizeBytes: compressedSize,
            thumbnailSizeBytes: thumbnailSize,
            savingsPercentage: savings,
            compressedBase64,
            compressedBlob: blobFull,
            compressedDataUrl,
            thumbnailBase64,
            thumbnailBlob: blobThumb,
            thumbnailDataUrl,
            mimeType: targetMime,
          });
        }, targetMime, 0.7);
      }, targetMime, quality);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image for compression: ${file.name}`));
    };

    img.src = objectUrl;
  });
}
