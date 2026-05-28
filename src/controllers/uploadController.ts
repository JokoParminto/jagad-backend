import { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import {
  optimizeProductImage,
  optimizeAvatarImage,
  generateThumbnail,
  deleteFile,
  getImageInfo
} from '../utils/imageProcessor'
// import { uploadDirs } from '../config/upload'
import { config } from '../config/env'

/**
 * Upload single image
 * POST /upload/image?type=product|avatar
 */
export const uploadImage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'File tidak ditemukan', 400)
    }

    const uploadType = req.query.type as string || 'temp'
    const file = req.file
    const originalPath = file.path
    const ext = path.extname(file.filename)
    const nameWithoutExt = path.basename(file.filename, ext)
    const optimizedFilename = `${nameWithoutExt}.webp`
    const optimizedPath = path.join(path.dirname(originalPath), optimizedFilename)

    // Optimize image based on type
    if (uploadType === 'product') {
      await optimizeProductImage(originalPath, optimizedPath)
    } else if (uploadType === 'avatar') {
      await optimizeAvatarImage(originalPath, optimizedPath)
    } else {
      // For temp files, just optimize with default settings
      await optimizeProductImage(originalPath, optimizedPath)
    }

    // Delete original file
    await deleteFile(originalPath)

    // Get optimized image info
    const imageInfo = await getImageInfo(optimizedPath)

    // Generate URL
    const relativePath = path.relative(config.upload.path, optimizedPath)
    const imageUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`

    res.json(successResponse({
      filename: optimizedFilename,
      originalName: file.originalname,
      url: imageUrl,
      path: optimizedPath,
      type: uploadType,
      ...imageInfo
    }, 'Image uploaded successfully'))

  } catch (error) {
    next(error)
  }
}

/**
 * Upload multiple images
 * POST /upload/images?type=product|avatar
 */
export const uploadMultipleImages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Files tidak ditemukan', 400)
    }

    const uploadType = req.query.type as string || 'temp'
    const files = req.files
    const results = []

    for (const file of files) {
      const originalPath = file.path
      const ext = path.extname(file.filename)
      const nameWithoutExt = path.basename(file.filename, ext)
      const optimizedFilename = `${nameWithoutExt}.webp`
      const optimizedPath = path.join(path.dirname(originalPath), optimizedFilename)

      // Optimize based on type
      if (uploadType === 'product') {
        await optimizeProductImage(originalPath, optimizedPath)
      } else if (uploadType === 'avatar') {
        await optimizeAvatarImage(originalPath, optimizedPath)
      } else {
        await optimizeProductImage(originalPath, optimizedPath)
      }

      // Delete original
      await deleteFile(originalPath)

      // Get info
      const imageInfo = await getImageInfo(optimizedPath)

      // Generate URL
      const relativePath = path.relative(config.upload.path, optimizedPath)
      const imageUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`

      results.push({
        filename: optimizedFilename,
        originalName: file.originalname,
        url: imageUrl,
        path: optimizedPath,
        type: uploadType,
        ...imageInfo
      })
    }

    res.json(successResponse({
      count: results.length,
      images: results
    }, `${results.length} images uploaded successfully`))

  } catch (error) {
    next(error)
  }
}

/**
 * Generate thumbnail
 * POST /upload/thumbnail
 * Body: { imageUrl: string, size?: number }
 */
export const createThumbnail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { imageUrl, size } = req.body

    if (!imageUrl) {
      throw new AppError('VALIDATION_ERROR', 'imageUrl is required', 400)
    }

    // Convert URL to file path
    const relativePath = imageUrl.replace('/uploads/', '')
    const imagePath = path.join(config.upload.path, relativePath)

    if (!fs.existsSync(imagePath)) {
      throw new AppError('NOT_FOUND', 'Image tidak ditemukan', 404)
    }

    // Generate thumbnail path
    const ext = path.extname(imagePath)
    const nameWithoutExt = path.basename(imagePath, ext)
    const thumbFilename = `${nameWithoutExt}-thumb.webp`
    const thumbPath = path.join(path.dirname(imagePath), thumbFilename)

    // Generate thumbnail
    await generateThumbnail(imagePath, thumbPath, size || 200)

    // Get info
    const thumbInfo = await getImageInfo(thumbPath)

    // Generate URL
    const thumbRelativePath = path.relative(config.upload.path, thumbPath)
    const thumbUrl = `/uploads/${thumbRelativePath.replace(/\\/g, '/')}`

    res.json(successResponse({
      filename: thumbFilename,
      url: thumbUrl,
      path: thumbPath,
      ...thumbInfo
    }, 'Thumbnail generated successfully'))

  } catch (error) {
    next(error)
  }
}

/**
 * Delete image
 * DELETE /upload/image
 * Body: { imageUrl: string }
 */
export const deleteImage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { imageUrl } = req.body

    if (!imageUrl) {
      throw new AppError('VALIDATION_ERROR', 'imageUrl is required', 400)
    }

    // Convert URL to file path
    const relativePath = imageUrl.replace('/uploads/', '')
    const imagePath = path.join(config.upload.path, relativePath)

    if (!fs.existsSync(imagePath)) {
      throw new AppError('NOT_FOUND', 'Image tidak ditemukan', 404)
    }

    // Delete file
    await deleteFile(imagePath)

    // Also delete thumbnail if exists
    const ext = path.extname(imagePath)
    const nameWithoutExt = path.basename(imagePath, ext)
    const thumbPath = path.join(path.dirname(imagePath), `${nameWithoutExt}-thumb.webp`)
    await deleteFile(thumbPath)

    res.json(successResponse(null, 'Image deleted successfully'))

  } catch (error) {
    next(error)
  }
}

/**
 * Get image info
 * GET /upload/info?url=...
 */
export const getImageDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { url } = req.query

    if (!url) {
      throw new AppError('VALIDATION_ERROR', 'url parameter is required', 400)
    }

    // Convert URL to file path
    const relativePath = (url as string).replace('/uploads/', '')
    const imagePath = path.join(config.upload.path, relativePath)

    if (!fs.existsSync(imagePath)) {
      throw new AppError('NOT_FOUND', 'Image tidak ditemukan', 404)
    }

    const imageInfo = await getImageInfo(imagePath)

    res.json(successResponse({
      url,
      path: imagePath,
      exists: true,
      ...imageInfo
    }))

  } catch (error) {
    next(error)
  }
}
