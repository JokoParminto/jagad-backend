# Upload API Documentation - Sederek Kasir

## 📤 Image Upload Endpoints

Base URL: `http://localhost:5000/api/v1/upload`

**Authentication Required:** ✅ All endpoints require JWT token

---

## Endpoints

### 1. Upload Single Image
**POST** `/upload/image?type=product|avatar`

Upload dan optimize gambar otomatis ke format WebP.

**Query Parameters:**
- `type` - `product` | `avatar` | `temp` (optional, default: `temp`)

**Request:**
```bash
# Form-data with field name: image
curl -X POST "http://localhost:5000/api/v1/upload/image?type=product" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/image.jpg"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "filename": "image-1706845123456-123456789.webp",
    "originalName": "coffee.jpg",
    "url": "/uploads/products/image-1706845123456-123456789.webp",
    "path": "/Users/.../uploads/products/image-1706845123456-123456789.webp",
    "type": "product",
    "width": 800,
    "height": 800,
    "format": "webp",
    "size": 245632,
    "sizeKB": 240,
    "sizeMB": "0.23"
  },
  "message": "Image uploaded successfully"
}
```

**Features:**
- ✅ Auto convert to WebP (best compression)
- ✅ Auto optimize quality (80%)
- ✅ Product images: 800x800px
- ✅ Avatar images: 200x200px
- ✅ Original file deleted after optimization

---

### 2. Upload Multiple Images
**POST** `/upload/images?type=product|avatar`

Upload multiple images sekaligus (max 10 files).

**Query Parameters:**
- `type` - `product` | `avatar` | `temp` (optional, default: `temp`)

**Request:**
```bash
# Form-data with field name: images (multiple)
curl -X POST "http://localhost:5000/api/v1/upload/images?type=product" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg" \
  -F "images=@/path/to/image3.jpg"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 3,
    "images": [
      {
        "filename": "images-1706845123456-111.webp",
        "originalName": "coffee1.jpg",
        "url": "/uploads/products/images-1706845123456-111.webp",
        "width": 800,
        "height": 800,
        "sizeKB": 230
      },
      {
        "filename": "images-1706845123456-222.webp",
        "originalName": "coffee2.jpg",
        "url": "/uploads/products/images-1706845123456-222.webp",
        "width": 800,
        "height": 800,
        "sizeKB": 245
      },
      {
        "filename": "images-1706845123456-333.webp",
        "originalName": "coffee3.jpg",
        "url": "/uploads/products/images-1706845123456-333.webp",
        "width": 800,
        "height": 800,
        "sizeKB": 220
      }
    ]
  },
  "message": "3 images uploaded successfully"
}
```

---

### 3. Generate Thumbnail
**POST** `/upload/thumbnail`

Generate thumbnail dari gambar yang sudah ada.

**Request Body:**
```json
{
  "imageUrl": "/uploads/products/image-123.webp",
  "size": 200
}
```

**Request:**
```bash
curl -X POST "http://localhost:5000/api/v1/upload/thumbnail" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "/uploads/products/image-123.webp",
    "size": 200
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "filename": "image-123-thumb.webp",
    "url": "/uploads/products/image-123-thumb.webp",
    "path": "/Users/.../uploads/products/image-123-thumb.webp",
    "width": 200,
    "height": 200,
    "format": "webp",
    "sizeKB": 15
  },
  "message": "Thumbnail generated successfully"
}
```

---

### 4. Delete Image
**DELETE** `/upload/image`

Hapus gambar dari server (termasuk thumbnail jika ada).

**Request Body:**
```json
{
  "imageUrl": "/uploads/products/image-123.webp"
}
```

**Request:**
```bash
curl -X DELETE "http://localhost:5000/api/v1/upload/image" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "/uploads/products/image-123.webp"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": null,
  "message": "Image deleted successfully"
}
```

---

### 5. Get Image Info
**GET** `/upload/info?url=/uploads/products/image-123.webp`

Get informasi detail gambar.

**Query Parameters:**
- `url` - Image URL (required)

**Request:**
```bash
curl -X GET "http://localhost:5000/api/v1/upload/info?url=/uploads/products/image-123.webp" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "/uploads/products/image-123.webp",
    "path": "/Users/.../uploads/products/image-123.webp",
    "exists": true,
    "width": 800,
    "height": 800,
    "format": "webp",
    "size": 245632,
    "sizeKB": 240,
    "sizeMB": "0.23"
  }
}
```

---

### 6. Get Image (Static)
**GET** `/uploads/{type}/{filename}`

Akses gambar langsung via URL.

**Request:**
```bash
# Bisa langsung di browser atau img tag
http://localhost:5000/uploads/products/image-123.webp
http://localhost:5000/uploads/avatars/avatar-456.webp
```

**Example in HTML:**
```html
<img src="http://localhost:5000/uploads/products/image-123.webp" alt="Product">
```

---

## 📁 Upload Directory Structure

```
uploads/
├── products/         # Product images (800x800)
│   ├── image-xxx.webp
│   └── image-xxx-thumb.webp
├── avatars/          # User avatars (200x200)
│   ├── avatar-xxx.webp
│   └── avatar-xxx-thumb.webp
└── temp/             # Temporary uploads
    └── temp-xxx.webp
```

---

## ⚙️ Image Processing

### Product Images
- **Size:** 800x800px (max)
- **Format:** WebP
- **Quality:** 80%
- **Fit:** Cover

### Avatar Images
- **Size:** 200x200px
- **Format:** WebP
- **Quality:** 80%
- **Fit:** Cover

### Thumbnails
- **Size:** 200x200px (customizable)
- **Format:** WebP
- **Quality:** 70%
- **Fit:** Cover

---

## 🔒 Security & Validation

### File Validation
- **Allowed formats:** JPEG, JPG, PNG, WEBP, GIF
- **Max file size:** 5MB (configurable)
- **Authentication:** Required for all endpoints

### Error Responses

**File not provided:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "File tidak ditemukan"
  }
}
```

**Invalid file type:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed."
  }
}
```

**File too large:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "File too large. Maximum size is 5MB"
  }
}
```

**Image not found:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Image tidak ditemukan"
  }
}
```

---

## 💡 Usage Examples

### Frontend - Upload Product Image

```javascript
// Using FormData
const uploadProductImage = async (file) => {
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch('http://localhost:5000/api/v1/upload/image?type=product', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })

  const result = await response.json()
  return result.data.url // /uploads/products/image-xxx.webp
}
```

### Frontend - Upload Multiple Images

```javascript
const uploadMultipleImages = async (files) => {
  const formData = new FormData()

  files.forEach(file => {
    formData.append('images', file)
  })

  const response = await fetch('http://localhost:5000/api/v1/upload/images?type=product', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })

  const result = await response.json()
  return result.data.images // Array of uploaded images
}
```

### Frontend - Delete Image

```javascript
const deleteImage = async (imageUrl) => {
  const response = await fetch('http://localhost:5000/api/v1/upload/image', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ imageUrl })
  })

  const result = await response.json()
  return result
}
```

### Vue.js Example

```vue
<template>
  <div>
    <input type="file" @change="handleFileChange" accept="image/*">
    <img v-if="imageUrl" :src="`http://localhost:5000${imageUrl}`" alt="Preview">
  </div>
</template>

<script setup>
import { ref } from 'vue'

const imageUrl = ref('')

const handleFileChange = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  const formData = new FormData()
  formData.append('image', file)

  try {
    const response = await fetch('http://localhost:5000/api/v1/upload/image?type=product', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    })

    const result = await response.json()
    if (result.success) {
      imageUrl.value = result.data.url
    }
  } catch (error) {
    console.error('Upload failed:', error)
  }
}
</script>
```

---

## 🧪 Testing

### Test with curl

```bash
# 1. Login to get token
TOKEN=$(curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.data.token')

# 2. Upload image
curl -X POST "http://localhost:5000/api/v1/upload/image?type=product" \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@test-image.jpg"

# 3. Get image info
curl -X GET "http://localhost:5000/api/v1/upload/info?url=/uploads/products/image-xxx.webp" \
  -H "Authorization: Bearer $TOKEN"

# 4. Delete image
curl -X DELETE "http://localhost:5000/api/v1/upload/image" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"/uploads/products/image-xxx.webp"}'
```

---

## 📊 Image Optimization Benefits

### Before Optimization
- **Format:** JPEG/PNG
- **Size:** ~2-5MB
- **Dimensions:** Variable

### After Optimization (WebP)
- **Format:** WebP
- **Size:** ~200-500KB (80-90% reduction!)
- **Dimensions:** 800x800 (product) or 200x200 (avatar)
- **Quality:** 80% (visually lossless)

**Savings Example:**
- Original JPEG: 3.5MB
- Optimized WebP: 320KB
- **Savings: 91%!** 🎉

---

## 🔧 Configuration

Edit `.env` untuk mengubah konfigurasi:

```env
# Upload path
UPLOAD_PATH=./uploads

# Max file size (bytes) - 5MB default
MAX_FILE_SIZE=5242880
```

---

**Upload API Ready!** 📸✨
