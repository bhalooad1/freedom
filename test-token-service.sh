#!/bin/bash

VIDEO_ID="dQw4w9WgXcQ"
SECRET="QWnhAwHY6pH8hi8fdWB5ReClZzTwbDiD"
TIMESTAMP=$(date +%s)000

# Generate HMAC-SHA256 signature
MESSAGE="${VIDEO_ID}:${TIMESTAMP}"
SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

echo "Testing token service..."
echo "Video ID: $VIDEO_ID"
echo "Timestamp: $TIMESTAMP"
echo "Signature: $SIGNATURE"
echo ""

curl -X POST http://localhost:8790/token/video-url \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: $SECRET" \
  -H "X-Request-Timestamp: $TIMESTAMP" \
  -H "X-Request-Signature: $SIGNATURE" \
  -d "{\"videoId\": \"$VIDEO_ID\", \"timestamp\": $TIMESTAMP, \"signature\": \"$SIGNATURE\"}"

echo ""
