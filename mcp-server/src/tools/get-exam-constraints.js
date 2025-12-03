import { loadConstraints } from '../data-loader.js';

/**
 * 검사 제약조건 조회
 * - 처방코드로 장비유형, 소요시간, 태그, 규칙 조회
 */
export function getExamConstraints(examCode) {
    const constraints = loadConstraints();

    if (!examCode || examCode.trim() === '') {
        return {
            success: false,
            error: '처방코드를 입력해주세요.'
        };
    }

    const searchCode = examCode.trim().toUpperCase();

    // 처방코드로 검사 찾기
    const exam = constraints.find(
        c => c['처방코드'].toUpperCase() === searchCode
    );

    if (!exam) {
        return {
            success: false,
            error: `'${examCode}' 처방코드를 찾을 수 없습니다.`
        };
    }

    // 태그와 규칙 파싱
    // CSV 파싱 시 따옴표가 제거되어 [#CT] 형태로 들어옴
    let tags = [];
    let rules = [];

    try {
        if (exam['태그'] && exam['태그'] !== '[]') {
            const tagStr = exam['태그'];
            // [#CT, #Chest] 형태를 ["#CT", "#Chest"] 형태로 변환
            if (tagStr.startsWith('[') && tagStr.includes('#')) {
                const inner = tagStr.slice(1, -1); // [] 제거
                tags = inner.split(',').map(t => t.trim()).filter(t => t);
            } else {
                tags = JSON.parse(tagStr);
            }
        }
    } catch (e) {
        tags = [];
    }

    try {
        if (exam['규칙'] && exam['규칙'] !== '[]') {
            const ruleStr = exam['규칙'];
            // [{avoid_tags:[#Nuclear],gap_days:1,reason:방사성...}] 형태 파싱
            if (ruleStr.startsWith('[{') && ruleStr.includes('avoid_tags')) {
                // 정규식으로 규칙 추출
                const ruleMatch = ruleStr.match(/avoid_tags:\[([^\]]+)\],gap_days:(\d+),reason:([^\}]+)/);
                if (ruleMatch) {
                    const avoidTags = ruleMatch[1].split(',').map(t => t.trim());
                    const gapDays = parseInt(ruleMatch[2]);
                    const reason = ruleMatch[3].trim();
                    rules = [{
                        avoid_tags: avoidTags,
                        gap_days: gapDays,
                        reason: reason
                    }];
                }
            } else {
                rules = JSON.parse(ruleStr);
            }
        }
    } catch (e) {
        // 파싱 실패 시 빈 배열
        rules = [];
    }

    return {
        success: true,
        data: {
            처방코드: exam['처방코드'],
            처방명: exam['처방명'],
            장비유형: exam['장비유형'],
            소요시간: parseInt(exam['소요시간']) || 30,
            태그: tags,
            규칙: rules
        }
    };
}

// 도구 정의 (MCP용)
export const getExamConstraintsTool = {
    name: 'get_exam_constraints',
    description: '처방코드로 검사 제약조건을 조회합니다. 장비유형, 소요시간, 태그, 규칙을 반환합니다.',
    inputSchema: {
        type: 'object',
        properties: {
            exam_code: {
                type: 'string',
                description: '처방코드 (예: HA443, NM010001, RC010001)'
            }
        },
        required: ['exam_code']
    }
};
