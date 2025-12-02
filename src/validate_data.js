const fs = require('fs');
const path = require('path');

// ============================================
// CSV 파일 읽기 유틸리티
// ============================================
function readCSV(filePath) {
    let csvData = fs.readFileSync(filePath, 'utf8');
    // BOM 제거
    if (csvData.charCodeAt(0) === 0xFEFF) {
        csvData = csvData.slice(1);
    }
    const lines = csvData.split('\n');
    const header = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        // 더 정확한 CSV 파싱 (JSON 내부의 쉼표 처리)
        const row = [];
        let current = '';
        let inQuotes = false;
        const line = lines[i];

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        row.push(current.trim()); // 마지막 필드

        const cleanRow = row.map(cell => {
            // 양쪽 따옴표 제거
            if (cell.startsWith('"') && cell.endsWith('"')) {
                return cell.slice(1, -1).replace(/""/g, '"');
            }
            return cell;
        });

        const obj = {};
        header.forEach((h, idx) => {
            obj[h] = cleanRow[idx] || '';
        });
        data.push(obj);
    }
    return { header, data };
}

// ============================================
// 검증 결과 저장
// ============================================
const validationResults = {
    summary: {},
    details: {}
};

function addResult(category, subcategory, status, message, examples = []) {
    if (!validationResults.details[category]) {
        validationResults.details[category] = [];
    }
    validationResults.details[category].push({
        subcategory,
        status,
        message,
        examples: examples.slice(0, 5) // 최대 5개 예시만
    });
}

// ============================================
// 메인 검증 로직
// ============================================
console.log('=== 데이터 정합성 검증 시작 ===\n');

// 파일 읽기
const patientSchedule = readCSV(path.join(__dirname, '../data/patient_schedule.csv'));
const resourceSchedule = readCSV(path.join(__dirname, '../data/resource_schedule.csv'));
const constraints = readCSV(path.join(__dirname, '../data/constraints.csv'));

console.log(`patient_schedule.csv: ${patientSchedule.data.length}건`);
console.log(`resource_schedule.csv: ${resourceSchedule.data.length}건`);
console.log(`constraints.csv: ${constraints.data.length}건\n`);

validationResults.summary = {
    patient_schedule_count: patientSchedule.data.length,
    resource_schedule_count: resourceSchedule.data.length,
    constraints_count: constraints.data.length
};

// ============================================
// 1. patient_schedule 내부 검증
// ============================================
console.log('--- 1. patient_schedule 내부 검증 ---');

// 1.1 필수 필드 검증
let missingFields = [];
patientSchedule.data.forEach((row, idx) => {
    if (!row['처방ID'] || !row['환자번호'] || !row['처방코드'] || !row['예약일시'] || !row['실제시작시간']) {
        missingFields.push({ index: idx + 2, row });
    }
});
addResult('patient_schedule', '필수 필드 검증',
    missingFields.length === 0 ? 'PASS' : 'FAIL',
    `필수 필드 누락: ${missingFields.length}건`,
    missingFields.map(m => `행 ${m.index}: 처방ID=${m.row['처방ID']}, 환자번호=${m.row['환자번호']}`)
);
console.log(`  필수 필드 누락: ${missingFields.length}건`);

// 1.2 예약일시 형식 검증 (YYYY-MM-DD HH:mm)
const dateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
let invalidDateTimes = [];
patientSchedule.data.forEach((row, idx) => {
    if (row['예약일시'] && !dateTimeRegex.test(row['예약일시'])) {
        invalidDateTimes.push({ index: idx + 2, value: row['예약일시'] });
    }
    if (row['실제시작시간'] && !dateTimeRegex.test(row['실제시작시간'])) {
        invalidDateTimes.push({ index: idx + 2, value: row['실제시작시간'], field: '실제시작시간' });
    }
});
addResult('patient_schedule', '날짜시간 형식 검증',
    invalidDateTimes.length === 0 ? 'PASS' : 'FAIL',
    `잘못된 형식: ${invalidDateTimes.length}건`,
    invalidDateTimes.map(d => `행 ${d.index}: ${d.value}`)
);
console.log(`  날짜시간 형식 오류: ${invalidDateTimes.length}건`);

// 1.3 운영시간 검증 (08:00 ~ 18:00)
let outsideHours = [];
patientSchedule.data.forEach((row, idx) => {
    if (row['예약일시']) {
        const timePart = row['예약일시'].split(' ')[1];
        if (timePart) {
            const hour = parseInt(timePart.split(':')[0]);
            if (hour < 8 || hour >= 18) {
                outsideHours.push({ index: idx + 2, time: row['예약일시'] });
            }
        }
    }
});
addResult('patient_schedule', '운영시간 검증 (08:00~18:00)',
    outsideHours.length === 0 ? 'PASS' : 'WARN',
    `운영시간 외 예약: ${outsideHours.length}건`,
    outsideHours.map(o => `행 ${o.index}: ${o.time}`)
);
console.log(`  운영시간 외 예약: ${outsideHours.length}건`);

// 1.4 중복 처방ID 검증
const prescriptionIds = {};
patientSchedule.data.forEach(row => {
    const id = row['처방ID'];
    prescriptionIds[id] = (prescriptionIds[id] || 0) + 1;
});
const duplicateIds = Object.entries(prescriptionIds).filter(([_, count]) => count > 1);
addResult('patient_schedule', '처방ID 중복 검증',
    duplicateIds.length === 0 ? 'PASS' : 'WARN',
    `중복 처방ID: ${duplicateIds.length}건`,
    duplicateIds.map(([id, count]) => `처방ID ${id}: ${count}회`)
);
console.log(`  중복 처방ID: ${duplicateIds.length}건`);

// 1.5 실제시작시간 순차성 검증 (같은 환자+예약시간+장비유형)
const codeToEquip = {};
constraints.data.forEach(row => {
    codeToEquip[row['처방코드']] = row['장비유형'];
});

const sequenceGroups = {};
patientSchedule.data.forEach((row, idx) => {
    const equip = codeToEquip[row['처방코드']] || 'Unknown';
    const key = `${row['환자번호']}|${row['예약일시']}|${equip}`;
    if (!sequenceGroups[key]) sequenceGroups[key] = [];
    sequenceGroups[key].push({ idx: idx + 2, ...row });
});

let sequenceErrors = [];
Object.entries(sequenceGroups).forEach(([key, items]) => {
    if (items.length < 2) return;
    items.sort((a, b) => a['실제시작시간'].localeCompare(b['실제시작시간']));
    for (let i = 1; i < items.length; i++) {
        if (items[i]['실제시작시간'] < items[i-1]['실제시작시간']) {
            sequenceErrors.push(`${key}: 순서 오류`);
        }
    }
});
addResult('patient_schedule', '연속검사 순차성 검증',
    sequenceErrors.length === 0 ? 'PASS' : 'WARN',
    `순차성 오류: ${sequenceErrors.length}건`,
    sequenceErrors
);
console.log(`  연속검사 순차성 오류: ${sequenceErrors.length}건`);

// ============================================
// 2. constraints 내부 검증
// ============================================
console.log('\n--- 2. constraints 내부 검증 ---');

// 2.1 필수 필드 검증
let constraintsMissing = [];
constraints.data.forEach((row, idx) => {
    if (!row['처방코드'] || !row['처방명'] || !row['장비유형']) {
        constraintsMissing.push({ index: idx + 2, code: row['처방코드'] });
    }
});
addResult('constraints', '필수 필드 검증',
    constraintsMissing.length === 0 ? 'PASS' : 'FAIL',
    `필수 필드 누락: ${constraintsMissing.length}건`,
    constraintsMissing.map(c => `행 ${c.index}: ${c.code}`)
);
console.log(`  필수 필드 누락: ${constraintsMissing.length}건`);

// 2.2 소요시간 검증 (양수)
let invalidDuration = [];
constraints.data.forEach((row, idx) => {
    const duration = parseInt(row['소요시간']);
    if (isNaN(duration) || duration <= 0) {
        invalidDuration.push({ index: idx + 2, code: row['처방코드'], duration: row['소요시간'] });
    }
});
addResult('constraints', '소요시간 검증',
    invalidDuration.length === 0 ? 'PASS' : 'FAIL',
    `잘못된 소요시간: ${invalidDuration.length}건`,
    invalidDuration.map(d => `${d.code}: ${d.duration}`)
);
console.log(`  잘못된 소요시간: ${invalidDuration.length}건`);

// 2.3 규칙 JSON 형식 검증
let invalidRules = [];
constraints.data.forEach((row, idx) => {
    if (row['규칙'] && row['규칙'] !== '[]') {
        try {
            const rules = JSON.parse(row['규칙']);
            if (!Array.isArray(rules)) {
                invalidRules.push({ index: idx + 2, code: row['처방코드'], error: 'Not an array' });
            } else {
                rules.forEach(rule => {
                    if (rule.avoid_tags && !Array.isArray(rule.avoid_tags)) {
                        invalidRules.push({ index: idx + 2, code: row['처방코드'], error: 'avoid_tags not array' });
                    }
                    if (rule.gap_days !== undefined && typeof rule.gap_days !== 'number') {
                        invalidRules.push({ index: idx + 2, code: row['처방코드'], error: 'gap_days not number' });
                    }
                });
            }
        } catch (e) {
            invalidRules.push({ index: idx + 2, code: row['처방코드'], error: e.message });
        }
    }
});
addResult('constraints', '규칙 JSON 형식 검증',
    invalidRules.length === 0 ? 'PASS' : 'FAIL',
    `잘못된 규칙 형식: ${invalidRules.length}건`,
    invalidRules.map(r => `${r.code}: ${r.error}`)
);
console.log(`  잘못된 규칙 형식: ${invalidRules.length}건`);

// ============================================
// 3. resource_schedule 내부 검증
// ============================================
console.log('\n--- 3. resource_schedule 내부 검증 ---');

// 3.1 필수 필드 검증
let resourceMissing = [];
resourceSchedule.data.forEach((row, idx) => {
    if (!row['처방ID'] || !row['리소스ID'] || !row['장비유형'] || !row['실제시작시간'] || !row['종료시간']) {
        resourceMissing.push({ index: idx + 2, id: row['처방ID'] });
    }
});
addResult('resource_schedule', '필수 필드 검증',
    resourceMissing.length === 0 ? 'PASS' : 'FAIL',
    `필수 필드 누락: ${resourceMissing.length}건`,
    resourceMissing.map(r => `행 ${r.index}: ${r.id}`)
);
console.log(`  필수 필드 누락: ${resourceMissing.length}건`);

// 3.2 시간 형식 검증
let invalidResourceTimes = [];
resourceSchedule.data.forEach((row, idx) => {
    if (row['실제시작시간'] && !dateTimeRegex.test(row['실제시작시간'])) {
        invalidResourceTimes.push({ index: idx + 2, field: '실제시작시간', value: row['실제시작시간'] });
    }
    if (row['종료시간'] && !dateTimeRegex.test(row['종료시간'])) {
        invalidResourceTimes.push({ index: idx + 2, field: '종료시간', value: row['종료시간'] });
    }
});
addResult('resource_schedule', '시간 형식 검증',
    invalidResourceTimes.length === 0 ? 'PASS' : 'FAIL',
    `잘못된 시간 형식: ${invalidResourceTimes.length}건`,
    invalidResourceTimes.map(t => `행 ${t.index}: ${t.field}=${t.value}`)
);
console.log(`  잘못된 시간 형식: ${invalidResourceTimes.length}건`);

// 3.3 종료시간 > 시작시간 검증
let invalidTimeRange = [];
resourceSchedule.data.forEach((row, idx) => {
    if (row['실제시작시간'] && row['종료시간']) {
        if (row['종료시간'] <= row['실제시작시간']) {
            invalidTimeRange.push({ index: idx + 2, start: row['실제시작시간'], end: row['종료시간'] });
        }
    }
});
addResult('resource_schedule', '시간 범위 검증',
    invalidTimeRange.length === 0 ? 'PASS' : 'FAIL',
    `시간 범위 오류 (종료<=시작): ${invalidTimeRange.length}건`,
    invalidTimeRange.map(t => `행 ${t.index}: ${t.start} ~ ${t.end}`)
);
console.log(`  시간 범위 오류: ${invalidTimeRange.length}건`);

// 3.4 슬롯 충돌 검증 (같은 리소스에서 시간 겹침)
const resourceSlots = {}; // { 리소스ID|날짜 -> [{start, end, 처방ID}] }
resourceSchedule.data.forEach(row => {
    if (!row['실제시작시간'] || !row['종료시간']) return;
    const date = row['실제시작시간'].split(' ')[0];
    const key = `${row['리소스ID']}|${date}`;
    if (!resourceSlots[key]) resourceSlots[key] = [];
    resourceSlots[key].push({
        start: row['실제시작시간'],
        end: row['종료시간'],
        처방ID: row['처방ID']
    });
});

let slotConflicts = [];
Object.entries(resourceSlots).forEach(([key, slots]) => {
    slots.sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < slots.length - 1; i++) {
        if (slots[i].end > slots[i + 1].start) {
            slotConflicts.push({
                resource: key,
                conflict: `${slots[i].처방ID} (${slots[i].start}~${slots[i].end}) vs ${slots[i+1].처방ID} (${slots[i+1].start}~${slots[i+1].end})`
            });
        }
    }
});
addResult('resource_schedule', '슬롯 충돌 검증',
    slotConflicts.length === 0 ? 'PASS' : 'FAIL',
    `슬롯 충돌: ${slotConflicts.length}건`,
    slotConflicts.map(c => `${c.resource}: ${c.conflict}`)
);
console.log(`  슬롯 충돌: ${slotConflicts.length}건`);

// 3.5 장비유형 목록 추출
const resourceEquipTypes = new Set();
resourceSchedule.data.forEach(row => {
    if (row['장비유형']) resourceEquipTypes.add(row['장비유형']);
});
console.log(`  장비유형 종류: ${resourceEquipTypes.size}개`);

// ============================================
// 4. 파일 간 정합성 검증
// ============================================
console.log('\n--- 4. 파일 간 정합성 검증 ---');

// 4.1 patient_schedule ↔ constraints: 처방코드 존재 여부
const constraintCodes = new Set(constraints.data.map(c => c['처방코드']));
let missingInConstraints = [];
const patientCodes = new Set();
patientSchedule.data.forEach(row => {
    patientCodes.add(row['처방코드']);
    if (!constraintCodes.has(row['처방코드'])) {
        missingInConstraints.push(row['처방코드']);
    }
});
const uniqueMissingCodes = [...new Set(missingInConstraints)];
addResult('파일간_정합성', 'patient→constraints 처방코드 매핑',
    uniqueMissingCodes.length === 0 ? 'PASS' : 'WARN',
    `constraints에 없는 처방코드: ${uniqueMissingCodes.length}종류 (${missingInConstraints.length}건)`,
    uniqueMissingCodes
);
console.log(`  constraints에 없는 처방코드: ${uniqueMissingCodes.length}종류`);

// 4.2 constraints ↔ resource_schedule: 장비유형 매핑
const constraintEquipTypes = new Set(constraints.data.map(c => c['장비유형']));
let unmatchedEquipTypes = [];
constraintEquipTypes.forEach(type => {
    if (!resourceEquipTypes.has(type)) {
        unmatchedEquipTypes.push(type);
    }
});
addResult('파일간_정합성', 'constraints→resource_schedule 장비유형 매핑',
    unmatchedEquipTypes.length === 0 ? 'PASS' : 'WARN',
    `resource_schedule에 없는 장비유형: ${unmatchedEquipTypes.length}개`,
    unmatchedEquipTypes
);
console.log(`  resource_schedule에 없는 장비유형: ${unmatchedEquipTypes.length}개`);

// 4.3 patient_schedule ↔ resource_schedule: 1:1 매핑 검증
const resourcePrescriptionIds = new Set(resourceSchedule.data.map(r => r['처방ID']));
const patientPrescriptionIds = new Set(patientSchedule.data.map(p => p['처방ID']));

let notInResource = [];
patientPrescriptionIds.forEach(id => {
    if (!resourcePrescriptionIds.has(id)) {
        notInResource.push(id);
    }
});

let notInPatient = [];
resourcePrescriptionIds.forEach(id => {
    if (!patientPrescriptionIds.has(id)) {
        notInPatient.push(id);
    }
});

addResult('파일간_정합성', 'patient↔resource 처방ID 1:1 매핑',
    notInResource.length === 0 && notInPatient.length === 0 ? 'PASS' : 'FAIL',
    `resource에 없음: ${notInResource.length}건, patient에 없음: ${notInPatient.length}건`,
    [...notInResource.slice(0, 3), ...notInPatient.slice(0, 3)]
);
console.log(`  resource_schedule에 없는 예약: ${notInResource.length}건`);
console.log(`  patient_schedule에 없는 예약: ${notInPatient.length}건`);

// 4.4 실제시작시간 일치 검증
const resourceStartTimes = {};
resourceSchedule.data.forEach(row => {
    resourceStartTimes[row['처방ID']] = row['실제시작시간'];
});

let startTimeMismatch = [];
patientSchedule.data.forEach(row => {
    const resourceStart = resourceStartTimes[row['처방ID']];
    if (resourceStart && resourceStart !== row['실제시작시간']) {
        startTimeMismatch.push({
            처방ID: row['처방ID'],
            patient: row['실제시작시간'],
            resource: resourceStart
        });
    }
});
addResult('파일간_정합성', '실제시작시간 일치 검증',
    startTimeMismatch.length === 0 ? 'PASS' : 'FAIL',
    `실제시작시간 불일치: ${startTimeMismatch.length}건`,
    startTimeMismatch.map(m => `${m.처방ID}: patient=${m.patient}, resource=${m.resource}`)
);
console.log(`  실제시작시간 불일치: ${startTimeMismatch.length}건`);

// ============================================
// 5. 검사간 규칙 위반 검증
// ============================================
console.log('\n--- 5. 검사간 규칙 위반 검증 ---');

// 5.1 constraints에서 태그와 규칙 매핑 생성
const codeToTags = {};
const codeToRules = {};
const codeToName = {};

constraints.data.forEach(row => {
    const code = row['처방코드'];
    codeToName[code] = row['처방명'];

    try {
        codeToTags[code] = JSON.parse(row['태그'] || '[]');
    } catch (e) {
        codeToTags[code] = [];
    }

    try {
        codeToRules[code] = JSON.parse(row['규칙'] || '[]');
    } catch (e) {
        codeToRules[code] = [];
    }
});

// 5.2 환자별 예약 그룹화
const patientAppointments = {};
patientSchedule.data.forEach(row => {
    const patientId = row['환자번호'];
    if (!patientAppointments[patientId]) {
        patientAppointments[patientId] = [];
    }
    patientAppointments[patientId].push({
        처방ID: row['처방ID'],
        처방코드: row['처방코드'],
        처방명: row['처방명'],
        예약일시: row['예약일시']
    });
});

// 5.3 규칙 위반 검사
const ruleViolations = [];
let patientsChecked = 0;
let appointmentPairsChecked = 0;

Object.entries(patientAppointments).forEach(([patientId, appointments]) => {
    if (appointments.length < 2) return;

    patientsChecked++;

    // 날짜순 정렬
    appointments.sort((a, b) => new Date(a.예약일시) - new Date(b.예약일시));

    // 모든 쌍에 대해 규칙 검사
    for (let i = 0; i < appointments.length; i++) {
        const first = appointments[i];
        let firstRules = codeToRules[first.처방코드];

        // 배열이 아니면 빈 배열로 처리
        if (!Array.isArray(firstRules)) firstRules = [];
        if (firstRules.length === 0) continue;

        for (let j = i + 1; j < appointments.length; j++) {
            const second = appointments[j];
            appointmentPairsChecked++;

            // 날짜 차이 계산
            const firstDate = new Date(first.예약일시.split(' ')[0]);
            const secondDate = new Date(second.예약일시.split(' ')[0]);
            const daysDiff = Math.floor((secondDate - firstDate) / (1000 * 60 * 60 * 24));

            // 각 규칙 검사
            firstRules.forEach(rule => {
                if (!rule || !rule.avoid_tags || !rule.gap_days) return;

                let secondTags = codeToTags[second.처방코드];
                if (!Array.isArray(secondTags)) secondTags = [];

                // 피해야 할 태그가 두 번째 검사에 있는지 확인
                const matchingTags = rule.avoid_tags.filter(tag => secondTags.includes(tag));

                if (matchingTags.length > 0 && daysDiff < rule.gap_days) {
                    ruleViolations.push({
                        환자번호: patientId,
                        첫번째검사: {
                            처방코드: first.처방코드,
                            처방명: first.처방명 || codeToName[first.처방코드],
                            예약일시: first.예약일시
                        },
                        두번째검사: {
                            처방코드: second.처방코드,
                            처방명: second.처방명 || codeToName[second.처방코드],
                            예약일시: second.예약일시
                        },
                        위반규칙: {
                            avoid_tags: matchingTags,
                            required_gap: rule.gap_days,
                            actual_gap: daysDiff,
                            reason: rule.reason
                        }
                    });
                }
            });
        }
    }
});

addResult('검사규칙_위반', '검사간 규칙 위반',
    ruleViolations.length === 0 ? 'PASS' : 'WARN',
    `규칙 위반: ${ruleViolations.length}건 (${patientsChecked}명 환자, ${appointmentPairsChecked}쌍 검사)`,
    ruleViolations.slice(0, 10).map(v =>
        `환자${v.환자번호}: ${v.첫번째검사.처방명?.substring(0,20)} (${v.첫번째검사.예약일시}) → ${v.두번째검사.처방명?.substring(0,20)} (${v.두번째검사.예약일시}) [${v.위반규칙.avoid_tags.join(',')}] 필요간격:${v.위반규칙.required_gap}일, 실제:${v.위반규칙.actual_gap}일`
    )
);

console.log(`  검사한 환자 수: ${patientsChecked}명`);
console.log(`  검사한 예약 쌍: ${appointmentPairsChecked}쌍`);
console.log(`  규칙 위반 건수: ${ruleViolations.length}건`);

// 위반 유형별 통계
const violationByTag = {};
ruleViolations.forEach(v => {
    v.위반규칙.avoid_tags.forEach(tag => {
        violationByTag[tag] = (violationByTag[tag] || 0) + 1;
    });
});

if (Object.keys(violationByTag).length > 0) {
    console.log('\n  태그별 위반 현황:');
    Object.entries(violationByTag)
        .sort((a, b) => b[1] - a[1])
        .forEach(([tag, count]) => {
            console.log(`    ${tag}: ${count}건`);
        });
}

// ============================================
// 결과 저장
// ============================================
validationResults.ruleViolations = ruleViolations;
validationResults.violationByTag = violationByTag;

// JSON 결과 저장
const resultPath = path.join(__dirname, '../data/validation_result.json');
fs.writeFileSync(resultPath, JSON.stringify(validationResults, null, 2), 'utf8');
console.log(`\n결과 저장: ${resultPath}`);

// ============================================
// 최종 요약
// ============================================
console.log('\n=== 검증 완료 ===');

let passCount = 0, warnCount = 0, failCount = 0;
Object.values(validationResults.details).forEach(items => {
    items.forEach(item => {
        if (item.status === 'PASS') passCount++;
        else if (item.status === 'WARN') warnCount++;
        else if (item.status === 'FAIL') failCount++;
    });
});

console.log(`PASS: ${passCount}건, WARN: ${warnCount}건, FAIL: ${failCount}건`);

// 상세 결과 출력
console.log('\n=== 상세 결과 ===');
Object.entries(validationResults.details).forEach(([category, items]) => {
    console.log(`\n[${category}]`);
    items.forEach(item => {
        const icon = item.status === 'PASS' ? 'v' : (item.status === 'WARN' ? '!' : 'X');
        console.log(`  [${icon}] ${item.subcategory}: ${item.message}`);
    });
});
