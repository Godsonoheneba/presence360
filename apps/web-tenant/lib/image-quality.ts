export type ImageQualityHint = {
  fileName: string;
  brightness: number;
  variance: number;
  warnings: string[];
};

export async function analyzeImageFile(file: File): Promise<ImageQualityHint> {
  const bitmap = await createImageBitmap(file);
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { fileName: file.name, brightness: 0, variance: 0, warnings: [] };
  }
  ctx.drawImage(bitmap, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size).data;
  let sum = 0;
  const luminance: number[] = [];
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminance.push(luma);
    sum += luma;
  }
  const avg = sum / luminance.length;
  let variance = 0;
  for (const value of luminance) {
    variance += (value - avg) ** 2;
  }
  variance /= luminance.length;

  const warnings: string[] = [];
  if (avg < 50) {
    warnings.push("Image is too dark");
  }
  if (avg > 220) {
    warnings.push("Image is too bright");
  }
  if (variance < 150) {
    warnings.push("Image looks blurry or low detail");
  }

  return {
    fileName: file.name,
    brightness: Math.round(avg),
    variance: Math.round(variance),
    warnings,
  };
}
