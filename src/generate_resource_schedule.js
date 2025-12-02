const fs = require('fs');

// CSV 파싱 함수
function parseCSV(csvData) {
    if (csvData.charCodeAt(0) === 0xFEFF) {
        csvData = csvData.slice(1);
    }
    const lines = csvData.split('\n');
    const header = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

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
        row.push(current.trim());

        const obj = {};
        header.forEach((h, idx) => {
            obj[h] = row[idx] || '';
        });
        data.push(obj);
    }
    return { header, data };
}

// 시간을 분 단위로 변환
function timeToMinutes(datetime) {
    const [datePart, timePart] = datetime.split(' ');
    const [hour, minute] = timePart.split(':').map(Number);
    return { date: datePart, minutes: hour * 60 + minute };
}

// 분을 시간 문자열로 변환
function minutesToTime(date, minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// 시간을 10분 단위 슬롯 인덱스로 변환 (리소스 점유 체크용)
function timeToSlot(datetime) {
    const [datePart, timePart] = datetime.split(' ');
    const [hour, minute] = timePart.split(':').map(Number);
    return { date: datePart, slot: hour * 6 + Math.floor(minute / 10) };
}

// 검사실 설정 (40개) - 연속검사 그룹 기준 분석 결과
const resourceConfig = {
    'CT': 5,
    'MRI': 4,
    '청력검사실': 4,
    '초음파(US)': 3,
    'SPECT/Gamma Camera': 3,
    '동맥경화도검사실': 2,
    '내시경실': 2,
    '신경심리검사실': 2,
    '심초음파실': 2,
    '전정기능검사실': 2,
    '폐기능검사실': 2,
    'PET-CT': 2,
    '홀터/ABPM': 1,
    '신경과기타': 1,
    'EMG/NCV검사실': 1,
    '자율신경검사실': 1,
    '뇌파검사실(EEG)': 1,
    '투시촬영': 1,
    '운동부하검사실': 1
};

// 리소스 초기화 (장비유형별 검사실 목록)
const resources = {};
let resourceId = 1;
Object.entries(resourceConfig).forEach(([equipment, count]) => {
    resources[equipment] = [];
    for (let i = 1; i <= count; i++) {
        resources[equipment].push({
            id: `R${String(resourceId++).padStart(3, '0')}`,
            name: count > 1 ? `${equipment}_${i}` : equipment,
            equipment: equipment,
            schedule: {} // { 'YYYY-MM-DD': Set of occupied slots }
        });
    }
});

console.log('=== resource_schedule.csv 생성 ===\n');
console.log('검사실 구성:');
Object.entries(resourceConfig).forEach(([eq, count]) => {
    console.log(`  ${eq}: ${count}개`);
});
console.log(`\n총 검사실: ${resourceId - 1}개`);

// constraints.csv 읽기
const constraintsCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/constraints.csv', 'utf8');
const constraintsData = parseCSV(constraintsCsv);

const codeToInfo = {};
constraintsData.data.forEach(row => {
    codeToInfo[row['처방코드']] = {
        duration: parseInt(row['소요시간']) || 20,
        equipment: row['장비유형']
    };
});

// patient_schedule.csv 읽기
const patientCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/patient_schedule.csv', 'utf8');
const patientData = parseCSV(patientCsv);

console.log(`\npatient_schedule.csv 로드: ${patientData.data.length}개 예약`);

// 같은 환자+같은 날짜+같은 장비유형 그룹으로 묶기 (연속 검사는 같은 리소스 배정)
const patientEquipGroups = {};
patientData.data.forEach((row, idx) => {
    const code = row['처방코드'];
    const info = codeToInfo[code];
    if (!info) return;

    const equipment = info.equipment;
    const actualStart = row['실제시작시간'];
    if (!actualStart) return;

    const date = actualStart.split(' ')[0];
    const key = `${row['환자번호']}|${date}|${equipment}`;

    if (!patientEquipGroups[key]) {
        patientEquipGroups[key] = [];
    }
    patientEquipGroups[key].push({ idx, row, equipment, duration: info.duration });
});

// 그룹별로 정렬 (실제시작시간 순)
Object.values(patientEquipGroups).forEach(group => {
    group.sort((a, b) => a.row['실제시작시간'].localeCompare(b.row['실제시작시간']));
});

// 리소스 배정 결과
const resourceSchedule = [];
const assignedByIdx = {}; // idx -> 배정된 리소스
let assignmentSuccess = 0;
let assignmentFail = 0;

// 그룹 단위로 배정 (연속 검사는 같은 리소스에)
Object.entries(patientEquipGroups).forEach(([groupKey, group]) => {
    const equipment = group[0].equipment;
    if (!resources[equipment]) {
        group.forEach(() => assignmentFail++);
        return;
    }

    // 그룹 전체가 들어갈 수 있는 리소스 찾기
    let assignedResource = null;

    for (const resource of resources[equipment]) {
        let canFitAll = true;

        for (const item of group) {
            const actualStart = item.row['실제시작시간'];
            const { date, minutes: startMinutes } = timeToMinutes(actualStart);
            const endMinutes = startMinutes + item.duration;
            const startSlot = Math.floor(startMinutes / 10);
            const endSlot = Math.ceil(endMinutes / 10);

            if (!resource.schedule[date]) {
                resource.schedule[date] = new Set();
            }

            for (let s = startSlot; s < endSlot; s++) {
                if (resource.schedule[date].has(s)) {
                    canFitAll = false;
                    break;
                }
            }
            if (!canFitAll) break;
        }

        if (canFitAll) {
            assignedResource = resource;
            break;
        }
    }

    if (assignedResource) {
        // 그룹 전체를 이 리소스에 배정
        group.forEach(item => {
            const actualStart = item.row['실제시작시간'];
            const { date, minutes: startMinutes } = timeToMinutes(actualStart);
            const endMinutes = startMinutes + item.duration;
            const startSlot = Math.floor(startMinutes / 10);
            const endSlot = Math.ceil(endMinutes / 10);

            // 슬롯 점유
            for (let s = startSlot; s < endSlot; s++) {
                assignedResource.schedule[date].add(s);
            }

            resourceSchedule.push({
                처방ID: item.row['처방ID'],
                리소스ID: assignedResource.id,
                리소스명: assignedResource.name,
                장비유형: equipment,
                예약일시: item.row['예약일시'],
                실제시작시간: actualStart,
                종료시간: minutesToTime(date, endMinutes)
            });
            assignmentSuccess++;
        });
    } else {
        // 배정 실패
        group.forEach(item => {
            console.log(`[경고] 배정 실패: ${item.row['처방ID']} (${equipment}) @ ${item.row['실제시작시간']}`);
            assignmentFail++;
        });
    }
});

console.log(`\n배정 결과:`);
console.log(`  성공: ${assignmentSuccess}개`);
console.log(`  실패: ${assignmentFail}개`);

// CSV 저장
const header = '처방ID,리소스ID,리소스명,장비유형,예약일시,실제시작시간,종료시간';
const rows = resourceSchedule.map(r =>
    `${r.처방ID},${r.리소스ID},${r.리소스명},${r.장비유형},${r.예약일시},${r.실제시작시간},${r.종료시간}`
);
const csvContent = '\uFEFF' + header + '\n' + rows.join('\n');

fs.writeFileSync('c:/Users/user/Desktop/AI_reservation/data/resource_schedule.csv', csvContent, 'utf8');

console.log(`\n=== 완료 ===`);
console.log(`resource_schedule.csv 저장됨 (${resourceSchedule.length}개 레코드)`);

// 샘플 출력
console.log('\n=== 샘플 데이터 (처음 10개) ===');
console.log('처방ID | 리소스ID | 리소스명 | 예약일시 | 실제시작 | 종료');
resourceSchedule.slice(0, 10).forEach(r => {
    console.log(`${r.처방ID} | ${r.리소스ID} | ${r.리소스명} | ${r.예약일시} | ${r.실제시작시간} | ${r.종료시간}`);
});

// 연속 검사 그룹 샘플
console.log('\n=== 연속 검사 그룹 샘플 ===');
const groupedByPatientTime = {};
resourceSchedule.forEach(r => {
    const key = r.예약일시;
    if (!groupedByPatientTime[key]) groupedByPatientTime[key] = [];
    groupedByPatientTime[key].push(r);
});

let sampleCount = 0;
Object.entries(groupedByPatientTime).forEach(([key, items]) => {
    if (items.length > 3 && sampleCount < 2) {
        console.log(`\n예약일시: ${key} (${items.length}개 검사)`);
        items.forEach(r => {
            console.log(`  ${r.리소스명} | ${r.실제시작시간} ~ ${r.종료시간}`);
        });
        sampleCount++;
    }
});
