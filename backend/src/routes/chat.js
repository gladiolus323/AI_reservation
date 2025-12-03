import express from 'express';
import { chat, clearSession } from '../services/claude.js';

const router = express.Router();

// 채팅 메시지 전송
router.post('/', async (req, res) => {
    try {
        const { sessionId, message } = req.body;

        if (!sessionId || !message) {
            return res.status(400).json({
                error: 'sessionId와 message가 필요합니다.'
            });
        }

        console.log(`[Chat] Session: ${sessionId}, Message: ${message}`);

        const response = await chat(sessionId, message);

        res.json({
            success: true,
            response: response
        });
    } catch (error) {
        console.error('[Chat Error]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 세션 초기화
router.delete('/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    clearSession(sessionId);

    res.json({
        success: true,
        message: `세션 ${sessionId}이(가) 초기화되었습니다.`
    });
});

export default router;
