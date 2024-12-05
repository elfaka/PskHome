FROM node:22 as builder
WORKDIR /app
COPY . .
RUN npm install && npm run build

# 2. 빌드 결과만 별도로 보관
FROM alpine:latest
WORKDIR /dist
COPY --from=builder /app/dist /dist