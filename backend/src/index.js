import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 환경 변수 먼저 로드
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

console.log('Loading .env from:', envPath);
console.log('ANTHROPIC_API_KEY loaded:', process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No');

// 라우터는 환경 변수 로드 후 동적 import
const { default: chatRouter } = await import('./routes/chat.js');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());

// 정적 파일 서빙 (웹 UI)
app.use(express.static(path.join(__dirname, '../../web')));

// API 라우트
app.use('/api/chat', chatRouter);

// 헬스 체크
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`\n🏥 AI 검사 예약 추천 서버 시작`);
    console.log(`   - API: http://localhost:${PORT}/api`);
    console.log(`   - 웹 UI: http://localhost:${PORT}`);
    console.log(`\n📋 API 엔드포인트:`);
    console.log(`   - POST /api/chat - 채팅 메시지 전송`);
    console.log(`   - DELETE /api/chat/:sessionId - 세션 초기화`);
    console.log(`   - GET /api/health - 헬스 체크\n`);
});
