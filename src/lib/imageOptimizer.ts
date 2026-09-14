import { egressTracker } from './egressTracker';

export interface OptimizedFileResult {
  fileBase64: string;
  mimeType: string;
  name: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  wasOptimized: boolean;
}

/**
 * Optimizes an image or document before sending over the network,
 * reducing payload egress by up to 90% while keeping OCR/text sharp.
 */
export async function optimizeFileForEgress(
  file: File,
  maxDimension = 1800,
  quality = 0.82
): Promise<OptimizedFileResult> {
  const originalSize = file.size;

  // Only optimize image types; PDFs and spreadsheets should pass through
  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    const base64 = await fileToBase64(file);
    return {
      fileBase64: base64,
      mimeType: file.type || 'application/octet-stream',
      name: file.name,
      originalSize,
      optimizedSize: originalSize,
      compressionRatio: 0,
      wasOptimized: false,
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // If the image is already small enough, no need to downscale heavily
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          // Fallback if canvas context fails
          fileToBase64(file).then(base64 => {
            resolve({
              fileBase64: base64,
              mimeType: file.type,
              name: file.name,
              originalSize,
              optimizedSize: originalSize,
              compressionRatio: 0,
              wasOptimized: false,
            });
          });
          return;
        }

        // High quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to optimized JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const commaIndex = dataUrl.indexOf(',');
        const fileBase64 = commaIndex > -1 ? dataUrl.substring(commaIndex + 1) : dataUrl;

        // Estimate size from base64 string
        const optimizedSize = Math.round((fileBase64.length * 3) / 4);
        const ratio = originalSize > 0 
          ? Math.max(0, Math.round(((originalSize - optimizedSize) / originalSize) * 100))
          : 0;

        // Record egress metrics
        egressTracker.recordImageCompression(originalSize, optimizedSize);

        resolve({
          fileBase64,
          mimeType: 'image/jpeg',
          name: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
          originalSize,
          optimizedSize,
          compressionRatio: ratio,
          wasOptimized: true,
        });
      } catch (err) {
        console.warn('[Image Optimizer] Canvas compression failed, using original file:', err);
        fileToBase64(file).then(base64 => {
          resolve({
            fileBase64: base64,
            mimeType: file.type,
            name: file.name,
            originalSize,
            optimizedSize: originalSize,
            compressionRatio: 0,
            wasOptimized: false,
          });
        });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      fileToBase64(file).then(base64 => {
        resolve({
          fileBase64: base64,
          mimeType: file.type,
          name: file.name,
          originalSize,
          optimizedSize: originalSize,
          compressionRatio: 0,
          wasOptimized: false,
        });
      });
    };

    img.src = objectUrl;
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const commaIdx = res.indexOf(',');
      resolve(commaIdx > -1 ? res.substring(commaIdx + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
