# The Code Detective wire server — runs on any container host
# (Koyeb, Hugging Face Spaces, Railway, Fly, ...). The Next.js app
# deploys to Vercel separately; see README.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY server ./server

# The server reads PORT from the environment (defaults to 1999).
EXPOSE 8000
ENV PORT=8000

CMD ["npx", "tsx", "server/index.ts"]
