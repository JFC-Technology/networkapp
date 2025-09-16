FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY ../../frontend/package*.json .
RUN npm install --legacy-peer-deps

# Copy application code
COPY ../../frontend .

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]