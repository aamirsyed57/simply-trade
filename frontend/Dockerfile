FROM node:22-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Dev server
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
