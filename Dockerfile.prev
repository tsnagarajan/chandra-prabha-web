# Use Node 20 on Debian for native builds (needed by swisseph)
FROM node:20-bullseye

# System deps for node-gyp / swisseph
RUN apt-get update && apt-get install -y \
    python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer cache)
COPY package*.json ./
RUN npm ci

# Copy the rest (includes /ephe with .se1 files)
COPY . .

# Build Next.js app
ENV NODE_ENV=production
RUN npm run build

# Render will set $PORT; Next must listen on it
ENV PORT=3000
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
