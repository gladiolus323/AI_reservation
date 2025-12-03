import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MCP 서버의 도구 함수들을 직접 import
import { getPatientInfo } from '../../../mcp-server/src/tools/get-patient-info.js';
import { getExamByCode } from '../../../mcp-server/src/tools/get-exam-by-code.js';
import { getExamConstraints } from '../../../mcp-server/src/tools/get-exam-constraints.js';
import { getUnavailableSlots } from '../../../mcp-server/src/tools/get-unavailable-slots.js';

// Claude API용 도구 정의
export const tools = [
    {
        name: 'get_patient_info',
        description: '환자번호로 기존 예약 목록과 외래 예약일을 조회합니다.',
        input_schema: {
            type: 'object',
            properties: {
                patient_id: {
                    type: 'string',
                    description: '환자번호 (예: 00003795)'
                }
            },
            required: ['patient_id']
        }
    },
    {
        name: 'get_exam_by_code',
        description: '처방코드로 검사 정보를 조회합니다. 처방코드 입력 시 해당 검사명과 장비유형을 반환합니다.',
        input_schema: {
            type: 'object',
            properties: {
                exam_code: {
                    type: 'string',
                    description: '처방코드 (예: HA443, NM010001, RC010001)'
                }
            },
            required: ['exam_code']
        }
    },
    {
        name: 'get_exam_constraints',
        description: '처방코드로 검사 제약조건을 조회합니다. 장비유형, 소요시간, 태그, 검사 간격 규칙을 반환합니다.',
        input_schema: {
            type: 'object',
            properties: {
                exam_code: {
                    type: 'string',
                    description: '처방코드 (예: HA443, NM010001, RC010001)'
                }
            },
            required: ['exam_code']
        }
    },
    {
        name: 'get_unavailable_slots',
        description: '특정 장비유형에 대해 예약 불가능한 시간대를 조회합니다. 이미 예약된 시간, 환자의 기존 예약과 충돌하는 시간, 검사 간격 규칙 위반 날짜를 반환합니다. AI는 운영시간(09:00~17:00)에서 이 불가능한 시간을 제외하고 추천해야 합니다.',
        input_schema: {
            type: 'object',
            properties: {
                equipment_type: {
                    type: 'string',
                    description: '장비유형 (예: MRI, CT, 초음파(US), 내시경실)'
                },
                start_date: {
                    type: 'string',
                    description: '검색 시작일 (YYYY-MM-DD 형식)'
                },
                end_date: {
                    type: 'string',
                    description: '검색 종료일 (YYYY-MM-DD 형식)'
                },
                patient_id: {
                    type: 'string',
                    description: '환자번호 - 환자의 기존 예약과 충돌 확인용'
                },
                exam_code: {
                    type: 'string',
                    description: '예약하려는 처방코드 - 검사 간격 규칙 확인용'
                }
            },
            required: ['equipment_type', 'start_date', 'end_date', 'patient_id', 'exam_code']
        }
    }
];

// 도구 실행 함수
export function executeTool(toolName, args) {
    switch (toolName) {
        case 'get_patient_info':
            return getPatientInfo(args.patient_id);

        case 'get_exam_by_code':
            return getExamByCode(args.exam_code);

        case 'get_exam_constraints':
            return getExamConstraints(args.exam_code);

        case 'get_unavailable_slots':
            return getUnavailableSlots(
                args.equipment_type,
                args.start_date,
                args.end_date,
                args.patient_id,
                args.exam_code
            );

        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}
