import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool } from './mcp-tools.js';
import { getSystemPrompt } from '../prompts/system-prompt.js';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// 대화 히스토리 저장 (세션별)
const conversations = new Map();

// 세션별 환자 요청 날짜 저장
const requestedDates = new Map();

/**
 * 사용자 메시지에서 요청 날짜 추출
 * 예: "9월 10일", "12월 25일", "1월 5일"
 */
function extractRequestedDate(userMessage) {
    // "N월 N일" 패턴 매칭
    const match = userMessage.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (!match) return null;

    const month = parseInt(match[1]);
    const day = parseInt(match[2]);

    // 현재 연도 기준으로 날짜 생성 (내년일 수도 있음)
    const now = new Date();
    let year = now.getFullYear();

    // 현재 월보다 작은 월이면 내년으로 간주
    if (month < now.getMonth() + 1) {
        year++;
    }

    // YYYY-MM-DD 형식으로 변환
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return {
        original: match[0],  // "9월 10일"
        formatted: dateStr,   // "2025-09-10"
        month,
        day
    };
}

/**
 * get_unavailable_slots 결과에서 요청 날짜가 예약 불가능한지 확인
 */
function checkDateUnavailable(toolResult, requestedDate) {
    if (!toolResult.success || !toolResult.data || !requestedDate) return null;

    const unavailableSlots = toolResult.data.unavailableSlots || [];
    const targetDate = unavailableSlots.find(slot => slot.date === requestedDate.formatted);

    if (!targetDate) return null;

    // 1. 주말인 경우
    if (targetDate.isWeekend) {
        return {
            isUnavailable: true,
            reason: '주말',
            message: `환자분이 요청하신 ${requestedDate.original}은 주말이라 예약이 불가능해요.`
        };
    }

    // 2. 검사 간격 규칙 위반 (gapViolations)
    if (targetDate.gapViolations && targetDate.gapViolations.length > 0) {
        const violation = targetDate.gapViolations[0];
        return {
            isUnavailable: true,
            reason: '검사간격규칙위반',
            message: `환자분이 요청하신 ${requestedDate.original}에는 예약이 불가능해요. (${violation.reason})`
        };
    }

    // 3. 해당 날짜 전체 시간대가 예약된 경우 (resourceBookings 체크)
    // 운영시간: 09:00~17:00 (8시간 = 480분)
    // 모든 리소스가 전체 시간 예약되었는지 확인
    if (targetDate.resourceBookings) {
        const resources = Object.keys(targetDate.resourceBookings);
        if (resources.length > 0) {
            // 간단히: 모든 리소스에 예약이 있고, 예약 시간이 많으면 불가능으로 판단
            // (정확한 판단은 복잡하므로, 여기서는 gapViolations/주말만 확실히 처리)
        }
    }

    return null;
}

/**
 * 도구 결과에 시스템 힌트 추가
 */
function addSystemHint(toolResult, hint) {
    return {
        ...toolResult,
        _system_hint: hint
    };
}

export async function chat(sessionId, userMessage) {
    // 세션별 대화 히스토리 가져오기
    if (!conversations.has(sessionId)) {
        conversations.set(sessionId, []);
    }
    const messages = conversations.get(sessionId);

    // 사용자 메시지에서 요청 날짜 추출 및 저장
    const extractedDate = extractRequestedDate(userMessage);
    if (extractedDate) {
        requestedDates.set(sessionId, extractedDate);
        console.log(`[Date Extracted] ${extractedDate.original} -> ${extractedDate.formatted}`);
    }

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
                    let result = executeTool(block.name, block.input);
                    console.log(`[Tool Result] ${block.name}:`, JSON.stringify(result).slice(0, 200));

                    // get_unavailable_slots 결과에서 요청 날짜 검증
                    if (block.name === 'get_unavailable_slots') {
                        const requestedDate = requestedDates.get(sessionId);
                        if (requestedDate) {
                            const unavailableCheck = checkDateUnavailable(result, requestedDate);
                            if (unavailableCheck && unavailableCheck.isUnavailable) {
                                console.log(`[Date Unavailable] ${requestedDate.original}: ${unavailableCheck.reason}`);
                                result = addSystemHint(result, {
                                    requestedDateUnavailable: true,
                                    requestedDate: requestedDate.original,
                                    reason: unavailableCheck.reason,
                                    requiredResponse: unavailableCheck.message + ' 대신 이런 날짜는 어떠세요?'
                                });
                            }
                        }
                    }

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
    requestedDates.delete(sessionId);
}

// 세션 목록 조회
export function getSessions() {
    return Array.from(conversations.keys());
}
