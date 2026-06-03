import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { config } from './env'

// Ensure upload directory exists
const uploadDir = config.upload.path
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Create subdirectories for different types
const productDir = path.join(uploadDir, 'products')
const avatarDir = path.join(uploadDir, 'avatars')
const logoDir = path.join(uploadDir, 'logos')
const tempDir = path.join(uploadDir, 'temp')

;[productDir, avatarDir, logoDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uploadType = req.query.type as string || 'temp'
    let destPath = tempDir

    switch (uploadType) {
      case 'product':
        destPath = productDir
        break
      case 'avatar':
        destPath = avatarDir
        break
      case 'logo':
        destPath = logoDir
        break
      default:
        destPath = tempDir
    }

    cb(null, destPath)
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    const filename = `${file.fieldname}-${uniqueSuffix}${ext}`
    cb(null, filename)
  }
})

// File filter
const fileFilter = (_req: any, file: any, cb: any) => {
  // Allowed mime types
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ]

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed.'), false)
  }
}

// Multer configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxSize, // 5MB default
  }
})

// Upload directories
export const uploadDirs = {
  products: productDir,
  avatars: avatarDir,
  logos: logoDir,
  temp: tempDir,
}
