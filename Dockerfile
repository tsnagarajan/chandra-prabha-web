# Dockerfile
FROM node:20-bullseye

# tools needed to compile swisseph (node-gyp)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install deps
COPY package*.json ./
RUN npm ci

# bring in source
COPY . .

# compile swisseph from source
RUN npm rebuild swisseph --build-from-source

# build Next.js app
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
