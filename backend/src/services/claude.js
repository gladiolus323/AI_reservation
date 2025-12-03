import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool } from './mcp-tools.js';
import { getSystemPrompt } from '../prompts/system-prompt.js';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// 대화 히스토리 저장 (세션별)
const conversations = new Map();

export async function chat(sessionId, userMessage) {
    // 세션별 대화 히스토리 가져오기
    if (!conversations.has(sessionId)) {
        conversations.set(sessionId, []);
    }
    const messages = conversations.get(sessionId);

    // 사용자 메시지 추가
    messages.push({
        role: 'user',
        content: userMessage
    });

    // Claude API 호출 (도구 사용 루프)
    let response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: getSystemPrompt(),
        tools: tools,
        messages: messages
    });

    // 도구 사용이 필요한 경우 반복 처리
    while (response.stop_reason === 'tool_use') {
        const assistantMessage = {
            role: 'assistant',
            content: response.content
        };
        messages.push(assistantMessage);

        // 도구 호출 결과 수집
        const toolResults = [];
        for (const block of response.content) {
            if (block.type === 'tool_use') {
                console.log(`[Tool Call] ${block.name}:`, JSON.stringify(block.input));

                try {
                    const result = executeTool(block.name, block.input);
                    console.log(`[Tool Result] ${block.name}:`, JSON.stringify(result).slice(0, 200));

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify(result)
                    });
                } catch (error) {
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify({ error: error.message }),
                        is_error: true
                    });
                }
            }
        }

        // 도구 결과를 메시지에 추가
        messages.push({
            role: 'user',
            content: toolResults
        });

        // 다시 Claude API 호출
        response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: getSystemPrompt(),
            tools: tools,
            messages: messages
        });
    }

    // 최종 응답 추출
    const assistantMessage = {
        role: 'assistant',
        content: response.content
    };
    messages.push(assistantMessage);

    // 텍스트 응답 추출
    const textResponse = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

    return textResponse;
}

// 세션 초기화
export function clearSession(sessionId) {
    conversations.delete(sessionId);
}

// 세션 목록 조회
export function getSessions() {
    return Array.from(conversations.keys());
}
