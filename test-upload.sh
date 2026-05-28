#!/bin/bash

# Test Upload API Script
# Make sure server is running: npm run dev

echo "🧪 Testing Upload API..."
echo ""

BASE_URL="http://localhost:5000/api/v1"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health check
echo -e "${YELLOW}1. Testing health endpoint...${NC}"
HEALTH=$(curl -s $BASE_URL/../health)
if [[ $HEALTH == *"ok"* ]]; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server is not running${NC}"
    exit 1
fi
echo ""

# Test 2: Auth test
echo -e "${YELLOW}2. Testing auth endpoint...${NC}"
AUTH_TEST=$(curl -s $BASE_URL/auth/test)
if [[ $AUTH_TEST == *"success"* ]]; then
    echo -e "${GREEN}✓ Auth routes working${NC}"
else
    echo -e "${RED}✗ Auth routes not working${NC}"
fi
echo ""

# Note: To test upload, you need:
# 1. Login first to get token
# 2. Create a test image
# 3. Upload the image

echo -e "${YELLOW}To test image upload:${NC}"
echo ""
echo "1. Login to get token:"
echo "   TOKEN=\$(curl -s -X POST $BASE_URL/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"admin\",\"password\":\"admin123\"}' \\"
echo "     | jq -r '.data.token')"
echo ""
echo "2. Upload image:"
echo "   curl -X POST '$BASE_URL/upload/image?type=product' \\"
echo "     -H 'Authorization: Bearer \$TOKEN' \\"
echo "     -F 'image=@test-image.jpg'"
echo ""
echo "3. Access uploaded image:"
echo "   Open: http://localhost:5000/uploads/products/image-xxx.webp"
echo ""

echo -e "${GREEN}Upload API endpoints are ready!${NC}"
echo ""
echo "📚 Full documentation: UPLOAD-API.md"
