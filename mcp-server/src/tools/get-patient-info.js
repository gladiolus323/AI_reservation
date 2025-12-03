import { loadPatientSchedule } from '../data-loader.js';

/**
 * 환자 정보 조회
 * - 환자번호로 환자의 기존 예약 목록과 외래 예약일 조회
 */
export function getPatientInfo(patientId) {
    const patientSchedule = loadPatientSchedule();

    // 해당 환자의 모든 예약 조회
    const patientRecords = patientSchedule.filter(
        record => record['환자번호'] === patientId
    );

    if (patientRecords.length === 0) {
        return {
            success: false,
            error: '해당 환자번호를 찾을 수 없습니다.'
        };
    }

    // 기존 검사 예약 목록 (날짜순 정렬)
    const examReservations = patientRecords
        .map(record => ({
            처방ID: record['처방ID'],
            처방명: record['처방명'],
            처방코드: record['처방코드'],
            예약일시: record['예약일시'],
            실제시작시간: record['실제시작시간'],
            환자수진부서: record['환자수진부서']
        }))
        .sort((a, b) => new Date(a.예약일시) - new Date(b.예약일시));

    // 가장 빠른 외래 예약일 (여러 레코드 중 가장 빠른 것)
    const outpatientDates = patientRecords
        .map(record => record['가장빠른외래예약일자'])
        .filter(date => date && date.trim() !== '')
        .sort();

    const nearestOutpatientDate = outpatientDates.length > 0 ? outpatientDates[0] : null;

    // 환자 수진 부서 (가장 최근 예약 기준)
    const latestRecord = patientRecords[patientRecords.length - 1];
    const department = latestRecord['환자수진부서'];

    return {
        success: true,
        data: {
            환자번호: patientId,
            외래예약일: nearestOutpatientDate,
            수진부서: department,
            기존검사예약: examReservations,
            총예약건수: examReservations.length
        }
    };
}

// 도구 정의 (MCP용)
export const getPatientInfoTool = {
    name: 'get_patient_info',
    description: '환자번호로 환자 정보를 조회합니다. 기존 검사 예약 목록과 가장 빠른 외래 예약일을 반환합니다.',
    inputSchema: {
        type: 'object',
        properties: {
            patient_id: {
                type: 'string',
                description: '환자번호 (예: 00005722)'
            }
        },
        required: ['patient_id']
    }
};
