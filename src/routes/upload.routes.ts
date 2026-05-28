import { Router } from 'express'
import { upload } from '../config/upload'
import { authenticate } from '../middleware/auth'
import {
  uploadImage,
  uploadMultipleImages,
  createThumbnail,
  deleteImage,
  getImageDetails
} from '../controllers/uploadController'

const router = Router()

// All upload routes require authentication
router.use(authenticate)

/**
 * Upload single image
 * POST /upload/image?type=product|avatar
 *
 * Example:
 * curl -X POST http://localhost:5000/api/v1/upload/image?type=product \
 *   -H "Authorization: Bearer TOKEN" \
 *   -F "image=@/path/to/image.jpg"
 */
router.post('/image', upload.single('image'), uploadImage)

/**
 * Upload multiple images
 * POST /upload/images?type=product|avatar
 * Max 10 files
 *
 * Example:
 * curl -X POST http://localhost:5000/api/v1/upload/images?type=product \
 *   -H "Authorization: Bearer TOKEN" \
 *   -F "images=@/path/to/image1.jpg" \
 *   -F "images=@/path/to/image2.jpg"
 */
router.post('/images', upload.array('images', 10), uploadMultipleImages)

/**
 * Generate thumbnail from existing image
 * POST /upload/thumbnail
 * Body: { imageUrl: string, size?: number }
 *
 * Example:
 * curl -X POST http://localhost:5000/api/v1/upload/thumbnail \
 *   -H "Authorization: Bearer TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"imageUrl": "/uploads/products/image-123.webp", "size": 200}'
 */
router.post('/thumbnail', createThumbnail)

/**
 * Delete image
 * DELETE /upload/image
 * Body: { imageUrl: string }
 *
 * Example:
 * curl -X DELETE http://localhost:5000/api/v1/upload/image \
 *   -H "Authorization: Bearer TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"imageUrl": "/uploads/products/image-123.webp"}'
 */
router.delete('/image', deleteImage)

/**
 * Get image info/details
 * GET /upload/info?url=/uploads/products/image-123.webp
 *
 * Example:
 * curl -X GET "http://localhost:5000/api/v1/upload/info?url=/uploads/products/image-123.webp" \
 *   -H "Authorization: Bearer TOKEN"
 */
router.get('/info', getImageDetails)

export default router
