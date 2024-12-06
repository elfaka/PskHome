# 1. Node.js 공식 이미지를 기반으로 사용
FROM node:22

# 2. 작업 디렉토리 생성
WORKDIR /app

# 3. package.json과 package-lock.json을 컨테이너에 복사
COPY package*.json ./

# 4. 의존성 설치 (npm install로 모든 의존성 설치)
RUN npm install

# 5. 나머지 애플리케이션 파일 복사
COPY . .

# 6. 애플리케이션 빌드 (npm run build 실행)
RUN npm run build

# 7. 애플리케이션 실행 (필요한 경우)
#CMD ["npm", "run", "start"]

# 8. (선택 사항) 특정 포트 열기
#EXPOSE 3000
