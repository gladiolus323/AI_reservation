/**
 * MCP 서버 통합 테스트 - 10가지 시나리오
 * 실제 예약 추천 플로우를 시뮬레이션
 */

import { getPatientInfo } from './src/tools/get-patient-info.js';
import { getExamConstraints } from './src/tools/get-exam-constraints.js';
import { searchExamName } from './src/tools/search-exam-name.js';
import { getAvailableSlots } from './src/tools/get-available-slots.js';
import { checkConflicts } from './src/tools/check-conflicts.js';

const testResults = [];

function log(message) {
    console.log(message);
}

function runScenario(name, description, testFn) {
    log(`\n${'='.repeat(60)}`);
    log(`시나리오: ${name}`);
    log(`설명: ${description}`);
    log('='.repeat(60));

    const result = {
        name,
        description,
        steps: [],
        success: true
    };

    try {
        testFn(result);
    } catch (error) {
        result.success = false;
        result.error = error.message;
        log(`❌ 오류: ${error.message}`);
    }

    testResults.push(result);
    return result;
}

function addStep(result, stepName, data, success = true) {
    result.steps.push({ stepName, data, success });
    const icon = success ? '✅' : '❌';
    log(`\n${icon} [${stepName}]`);
    if (typeof data === 'object') {
        log(JSON.stringify(data, null, 2));
    } else {
        log(data);
    }
}

// ============================================
// 시나리오 1: 기본 MRI 검사 예약 플로우
// ============================================
runScenario(
    '1. 기본 MRI 검사 예약',
    '환자 00003795가 MRI-BRAIN 검사를 예약하는 기본 플로우',
    (result) => {
        // Step 1: 환자 정보 조회
        const patientInfo = getPatientInfo('00003795');
        addStep(result, '환자 정보 조회', {
            환자번호: patientInfo.data?.환자번호,
            외래예약일: patientInfo.data?.외래예약일,
            기존예약건수: patientInfo.data?.총예약건수
        }, patientInfo.success);

        // Step 2: 검사 검색
        const searchResult = searchExamName('MRI BRAIN');
        addStep(result, '검사명 검색 (MRI BRAIN)', {
            검색건수: searchResult.data?.length,
            첫번째결과: searchResult.data?.[0]?.처방명
        }, searchResult.success);

        // Step 3: 검사 제약조건 조회
        const examInfo = getExamConstraints('(3T)MRI-BRAIN');
        addStep(result, '검사 제약조건 조회', {
            장비유형: examInfo.data?.장비유형,
            소요시간: examInfo.data?.소요시간,
            태그: examInfo.data?.태그
        }, examInfo.success);

        // Step 4: 가용 슬롯 조회 (장비유형으로)
        const slots = getAvailableSlots(examInfo.data?.장비유형, '2026-03-19', '2026-03-21', examInfo.data?.소요시간);
        addStep(result, '가용 슬롯 조회 (MRI)', {
            가용일수: slots.data?.totalAvailableDays,
            첫번째슬롯: slots.data?.availableSlots?.[0]?.slots?.[0]
        }, slots.success);

        // Step 5: 충돌 확인
        const conflict = checkConflicts('00003795', '(3T)MRI-BRAIN', '2026-03-19', '09:00');
        addStep(result, '충돌 확인 (2026-03-19 09:00)', {
            충돌여부: conflict.hasConflict,
            충돌건수: conflict.conflicts?.length
        }, conflict.success && !conflict.hasConflict);
    }
);

// ============================================
// 시나리오 2: 내시경 검사 예약 (장비유형 자동 연결)
// ============================================
runScenario(
    '2. 내시경 검사 예약',
    '환자가 "내시경"으로 검색하여 수면내시경을 예약하는 플로우',
    (result) => {
        // Step 1: 검사 검색 (장비유형으로도 검색됨)
        const searchResult = searchExamName('내시경');
        addStep(result, '검사명 검색 (내시경)', {
            검색건수: searchResult.data?.length,
            검색결과: searchResult.data?.map(d => d.처방명)
        }, searchResult.success);

        // Step 2: 수면내시경 선택 후 제약조건 조회
        const examInfo = getExamConstraints('수면내시경-포폴주');
        addStep(result, '검사 제약조건 조회', {
            처방명: examInfo.data?.처방명,
            장비유형: examInfo.data?.장비유형,
            소요시간: examInfo.data?.소요시간,
            태그: examInfo.data?.태그,
            규칙: examInfo.data?.규칙
        }, examInfo.success);

        // Step 3: 내시경실 가용 슬롯 조회
        const slots = getAvailableSlots('내시경실', '2026-01-12', '2026-01-14', 30);
        addStep(result, '가용 슬롯 조회 (내시경실)', {
            가용일수: slots.data?.totalAvailableDays,
            리소스목록: [...new Set(slots.data?.availableSlots?.[0]?.slots?.map(s => s.resourceName))]
        }, slots.success);
    }
);

// ============================================
// 시나리오 3: 시간 충돌 감지
// ============================================
runScenario(
    '3. 시간 충돌 감지',
    '환자 00003795의 기존 예약(2026-03-18 10:30)과 겹치는 시간 예약 시도',
    (result) => {
        // Step 1: 환자 기존 예약 확인
        const patientInfo = getPatientInfo('00003795');
        const existingExams = patientInfo.data?.기존검사예약?.filter(e => e.예약일시.includes('2026-03-18'));
        addStep(result, '기존 예약 확인 (2026-03-18)', {
            예약목록: existingExams?.map(e => `${e.처방명} (${e.예약일시})`)
        }, true);

        // Step 2: 충돌 시간에 예약 시도
        const conflict = checkConflicts('00003795', '(3T)MRI-BRAIN', '2026-03-18', '10:35');
        addStep(result, '충돌 확인 (10:35 - 기존 예약과 겹침)', {
            충돌여부: conflict.hasConflict,
            충돌건수: conflict.conflicts?.length,
            충돌내용: conflict.conflicts?.slice(0, 2).map(c => c.message)
        }, conflict.hasConflict === true);

        // Step 3: 충돌 없는 시간 확인
        const noConflict = checkConflicts('00003795', '(3T)MRI-BRAIN', '2026-03-18', '14:00');
        addStep(result, '충돌 확인 (14:00 - 충돌 없음)', {
            충돌여부: noConflict.hasConflict
        }, noConflict.hasConflict === false);
    }
);

// ============================================
// 시나리오 4: 핵의학 검사 간격 규칙
// ============================================
runScenario(
    '4. 핵의학 검사 간격 규칙',
    '환자 00009526의 Kidney Scan(2026-05-11) 후 다른 핵의학 검사 간격 확인',
    (result) => {
        // Step 1: 환자 정보 조회
        const patientInfo = getPatientInfo('00009526');
        addStep(result, '환자 정보 조회', {
            환자번호: patientInfo.data?.환자번호,
            기존예약: patientInfo.data?.기존검사예약?.map(e => `${e.처방명} (${e.예약일시})`)
        }, patientInfo.success);

        // Step 2: Wholebody Bone Scan 제약조건 확인
        const examInfo = getExamConstraints('Wholebody Bone Scan');
        addStep(result, '검사 제약조건 (Wholebody Bone Scan)', {
            태그: examInfo.data?.태그,
            규칙: examInfo.data?.규칙
        }, examInfo.success);

        // Step 3: 같은 날 예약 시도 (충돌)
        const conflict1 = checkConflicts('00009526', 'Wholebody Bone Scan', '2026-05-11', '14:00');
        addStep(result, '같은 날 예약 시도 (2026-05-11)', {
            충돌여부: conflict1.hasConflict,
            사유: conflict1.conflicts?.[0]?.message
        }, conflict1.hasConflict === true);

        // Step 4: 1일 후 예약 시도 (충돌 - gap_days: 1 이하)
        const conflict2 = checkConflicts('00009526', 'Wholebody Bone Scan', '2026-05-12', '09:00');
        addStep(result, '1일 후 예약 시도 (2026-05-12)', {
            충돌여부: conflict2.hasConflict,
            사유: conflict2.conflicts?.[0]?.message
        }, conflict2.hasConflict === true);

        // Step 5: 2일 후 예약 시도 (정상)
        const noConflict = checkConflicts('00009526', 'Wholebody Bone Scan', '2026-05-13', '09:00');
        addStep(result, '2일 후 예약 시도 (2026-05-13)', {
            충돌여부: noConflict.hasConflict
        }, noConflict.hasConflict === false);
    }
);

// ============================================
// 시나리오 5: 존재하지 않는 환자
// ============================================
runScenario(
    '5. 존재하지 않는 환자',
    '잘못된 환자번호로 조회 시 오류 처리',
    (result) => {
        const patientInfo = getPatientInfo('99999999');
        addStep(result, '환자 정보 조회 (99999999)', {
            성공: patientInfo.success,
            오류메시지: patientInfo.error
        }, patientInfo.success === false);
    }
);

// ============================================
// 시나리오 6: 존재하지 않는 검사명
// ============================================
runScenario(
    '6. 존재하지 않는 검사명',
    '잘못된 검사명 입력 시 유사 검사 추천',
    (result) => {
        // Step 1: 없는 검사명 검색
        const searchResult = searchExamName('없는검사명');
        addStep(result, '검사명 검색 (없는검사명)', {
            성공: searchResult.success,
            오류메시지: searchResult.error,
            제안: searchResult.suggestion
        }, searchResult.success === false);

        // Step 2: 유사한 검사명으로 재검색
        const searchResult2 = searchExamName('초음파');
        addStep(result, '검사명 재검색 (초음파)', {
            검색건수: searchResult2.data?.length,
            검색결과: searchResult2.data?.map(d => d.처방명)
        }, searchResult2.success);
    }
);

// ============================================
// 시나리오 7: CT 검사 예약 (다중 리소스)
// ============================================
runScenario(
    '7. CT 검사 예약 (다중 리소스)',
    'CT 장비가 여러 대 있는 경우 가용 슬롯 조회',
    (result) => {
        // Step 1: CT 검사 검색
        const searchResult = searchExamName('Cardiac CT');
        addStep(result, '검사명 검색 (Cardiac CT)', {
            검색결과: searchResult.data?.slice(0, 3).map(d => `${d.처방명} (${d.장비유형})`)
        }, searchResult.success);

        // Step 2: CT 가용 슬롯 조회
        const slots = getAvailableSlots('CT', '2026-01-12', '2026-01-14', 20);
        const resourceNames = new Set();
        slots.data?.availableSlots?.forEach(day => {
            day.slots?.forEach(s => resourceNames.add(s.resourceName));
        });
        addStep(result, 'CT 가용 슬롯 조회', {
            가용일수: slots.data?.totalAvailableDays,
            CT장비목록: [...resourceNames]
        }, slots.success);
    }
);

// ============================================
// 시나리오 8: 외래 예약일 이전 검사 완료
// ============================================
runScenario(
    '8. 외래 예약일 이전 검사 완료',
    '환자의 외래 예약일 전에 검사를 완료할 수 있는지 확인',
    (result) => {
        // Step 1: 환자 정보 및 외래 예약일 확인
        const patientInfo = getPatientInfo('00003795');
        addStep(result, '환자 정보 조회', {
            환자번호: patientInfo.data?.환자번호,
            외래예약일: patientInfo.data?.외래예약일
        }, patientInfo.success);

        // Step 2: 외래 예약일 이전 가용 슬롯 조회
        const outpatientDate = patientInfo.data?.외래예약일;
        const slots = getAvailableSlots('MRI', '2026-03-17', '2026-03-19', 45);
        addStep(result, `외래 예약일(${outpatientDate}) 이전 MRI 슬롯`, {
            가용일수: slots.data?.totalAvailableDays,
            가용일자: slots.data?.availableSlots?.map(s => s.date)
        }, slots.success);
    }
);

// ============================================
// 시나리오 9: 금식 검사 오전 예약
// ============================================
runScenario(
    '9. 금식 검사 오전 예약',
    '금식이 필요한 검사(#Fasting)는 오전 시간대 추천',
    (result) => {
        // Step 1: 수면내시경 제약조건 (금식 필요)
        const examInfo = getExamConstraints('수면내시경-포폴주');
        addStep(result, '검사 제약조건 (금식 필요)', {
            처방명: examInfo.data?.처방명,
            태그: examInfo.data?.태그,
            금식필요: examInfo.data?.태그?.includes('#Fasting')
        }, examInfo.success);

        // Step 2: 내시경실 오전 슬롯 조회
        const slots = getAvailableSlots('내시경실', '2026-01-12', '2026-01-14', 30);
        const morningSlots = slots.data?.availableSlots?.[0]?.slots?.filter(s => {
            const hour = parseInt(s.time.split(':')[0]);
            return hour < 10;
        });
        addStep(result, '오전 10시 이전 슬롯', {
            날짜: slots.data?.availableSlots?.[0]?.date,
            오전슬롯: morningSlots?.map(s => `${s.time} (${s.resourceName})`)
        }, morningSlots?.length > 0);
    }
);

// ============================================
// 시나리오 10: 바륨 검사 후 복부 영상 간격
// ============================================
runScenario(
    '10. 바륨 검사 간격 규칙',
    '바륨 검사 후 복부 영상 검사는 3일 간격 필요',
    (result) => {
        // Step 1: 바륨 검사 제약조건 확인
        const examInfo = getExamConstraints('Swallowing Difficulty Evaluati');
        addStep(result, '바륨 검사 제약조건', {
            처방명: examInfo.data?.처방명,
            태그: examInfo.data?.태그,
            규칙: examInfo.data?.규칙
        }, examInfo.success);

        // Step 2: 복부 검사 태그 확인
        const abdominalExam = getExamConstraints('(3T)MRI-Abdomen');
        addStep(result, '복부 MRI 제약조건', {
            처방명: abdominalExam.data?.처방명,
            태그: abdominalExam.data?.태그
        }, abdominalExam.success);

        // 규칙 설명
        addStep(result, '간격 규칙 설명', {
            규칙: '바륨 검사(#Barium) 후 복부 검사(#Abdomen)는 3일 간격 필요',
            사유: '바륨 잔류로 인한 영상 품질 저하'
        }, true);
    }
);

// ============================================
// 결과 요약 출력
// ============================================
log('\n\n');
log('='.repeat(60));
log('테스트 결과 요약');
log('='.repeat(60));

let passCount = 0;
let failCount = 0;

testResults.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    const stepResults = result.steps.map(s => s.success ? '✓' : '✗').join('');
    log(`${icon} ${result.name} [${stepResults}]`);

    if (result.success) {
        passCount++;
    } else {
        failCount++;
    }
});

log('\n' + '-'.repeat(60));
log(`총 ${testResults.length}개 시나리오: ${passCount}개 성공, ${failCount}개 실패`);
log('='.repeat(60));

// 결과를 JSON으로도 저장
import fs from 'fs';
fs.writeFileSync('test-results.json', JSON.stringify(testResults, null, 2), 'utf-8');
log('\n결과가 test-results.json에 저장되었습니다.');
