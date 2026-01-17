FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy migration script
COPY migrate.js ./

# Create migrations mount point
RUN mkdir -p /migrations

# Set default environment variables
ENV DB_HOST=mysql \
    DB_PORT=3306 \
    DB_USER=root \
    DB_PASSWORD=rootpassword \
    DB_NAME=zynk_db \
    MIGRATIONS_DIR=/migrations

# Run migrations
CMD ["node", "migrate.js"]
