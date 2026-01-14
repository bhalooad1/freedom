FROM denoland/deno:2.1.4

WORKDIR /app

# Copy all files
COPY . .

# Cache dependencies
RUN deno cache src/main.ts

# Create temp directory for youtubei.js cache
RUN mkdir -p /var/tmp/youtubei.js

# Expose port (Railway will set PORT env var)
EXPOSE 8790

# Run the app
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write=/var/tmp/youtubei.js", "src/main.ts"]
