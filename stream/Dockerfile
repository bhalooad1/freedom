# Dockerfile for Freedom streaming server (Deno)
FROM denoland/deno:1.40.0

WORKDIR /app

# Copy dependency files first for better caching
COPY deno.json deno.lock* ./

# Copy source code
COPY . .

# Cache dependencies
RUN deno cache src/main.ts

# Run as non-root user
USER deno

# Expose port
EXPOSE 8080

# Start the server
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "src/main.ts"]
