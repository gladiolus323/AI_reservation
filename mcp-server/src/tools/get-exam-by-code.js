import { loadConstraints } from '../data-loader.js';

/**
 * 처방코드로 검사 정보 조회
 * - 처방코드 입력 시 해당 검사명과 장비유형 반환
 * - 환자가 처방전에서 코드를 보고 입력하는 용도
 */
export function getExamByCode(examCode) {
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

    if (exam) {
        return {
            success: true,
            data: {
                처방코드: exam['처방코드'],
                처방명: exam['처방명'],
                장비유형: exam['장비유형'],
                소요시간: exam['소요시간']
            }
        };
    }

    // 찾지 못한 경우
    return {
        success: false,
        error: `'${examCode}' 처방코드를 찾을 수 없습니다.`,
        suggestion: '처방코드를 다시 확인해주세요. 예: HA443, NM010001, RC010001'
    };
}

// 도구 정의 (MCP용)
export const getExamByCodeTool = {
    name: 'get_exam_by_code',
    description: '처방코드로 검사 정보를 조회합니다. 처방코드 입력 시 해당 검사명과 장비유형을 반환합니다.',
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
