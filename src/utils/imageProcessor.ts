import sharp from 'sharp'
import fs from 'fs'

export interface ImageProcessOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'jpeg' | 'png' | 'webp'
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
}

/**
 * Process and optimize image
 */
export const processImage = async (
  inputPath: string,
  outputPath: string,
  options: ImageProcessOptions = {}
): Promise<void> => {
  const {
    width,
    height,
    quality = 80,
    format = 'webp',
    fit = 'cover'
  } = options

  try {
    let pipeline = sharp(inputPath)

    // Resize if dimensions provided
    if (width || height) {
      pipeline = pipeline.resize(width, height, {
        fit,
        withoutEnlargement: true
      })
    }

    // Convert format and compress
    switch (format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality, progressive: true })
        break
      case 'png':
        pipeline = pipeline.png({ quality, compressionLevel: 9 })
        break
      case 'webp':
        pipeline = pipeline.webp({ quality })
        break
    }

    await pipeline.toFile(outputPath)
  } catch (error) {
    console.error('Error processing image:', error)
    throw new Error('Failed to process image')
  }
}

/**
 * Generate thumbnail
 */
export const generateThumbnail = async (
  inputPath: string,
  outputPath: string,
  size: number = 200
): Promise<void> => {
  await processImage(inputPath, outputPath, {
    width: size,
    height: size,
    quality: 70,
    format: 'webp',
    fit: 'cover'
  })
}

/**
 * Optimize product image
 */
export const optimizeProductImage = async (
  inputPath: string,
  outputPath: string
): Promise<void> => {
  await processImage(inputPath, outputPath, {
    width: 800,
    height: 800,
    quality: 80,
    format: 'webp',
    fit: 'cover'
  })
}

/**
 * Optimize avatar image
 */
export const optimizeAvatarImage = async (
  inputPath: string,
  outputPath: string
): Promise<void> => {
  await processImage(inputPath, outputPath, {
    width: 200,
    height: 200,
    quality: 80,
    format: 'webp',
    fit: 'cover'
  })
}

/**
 * Delete file
 */
export const deleteFile = async (filePath: string): Promise<void> => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
    }
  } catch (error) {
    console.error('Error deleting file:', error)
  }
}

/**
 * Get file info
 */
export const getImageInfo = async (filePath: string) => {
  try {
    const metadata = await sharp(filePath).metadata()
    const stats = await fs.promises.stat(filePath)

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: stats.size,
      sizeKB: Math.round(stats.size / 1024),
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
    }
  } catch (error) {
    console.error('Error getting image info:', error)
    throw new Error('Failed to get image info')
  }
}
