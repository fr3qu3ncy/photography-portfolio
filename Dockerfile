FROM node:20-alpine

RUN apk add --no-cache nginx

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/uploads /app/data

# Fix file permissions for nginx
RUN chmod -R 755 /app/public && chmod -R 755 /app/uploads

# Copy nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

EXPOSE 3000

# Start nginx + express
CMD ["sh", "-c", "nginx && node server.js"]
