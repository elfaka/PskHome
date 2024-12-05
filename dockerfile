# 1. Node.js 공식 이미지를 기반으로 사용
FROM node:22

# 2. 작업 디렉토리 생성 (컨테이너 내에서 실행할 디렉토리)
WORKDIR /app

# 3. package.json과 package-lock.json (또는 yarn.lock) 파일을 복사
# 의존성 설치를 위해 먼저 복사합니다.
COPY package*.json ./

# 4. 의존성 설치 (npm install)
RUN npm install

# 5. 나머지 애플리케이션 파일 복사
COPY . .

# 6. 애플리케이션 빌드 (만약 빌드 과정이 필요하다면)
RUN npm run build

# 7. 애플리케이션 실행 명령어 (만약 애플리케이션을 실행할 필요가 있다면)
CMD ["npm", "run", "start"]

# 8. (선택 사항) 특정 포트 열기 (서버 애플리케이션인 경우)
EXPOSE 3000
