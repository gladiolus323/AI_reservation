const fs = require('fs');

// CSV 파싱 함수 (쉼표 포함 필드 처리)
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

// 시간 계산 함수
function addMinutes(datetime, minutes) {
    const [datePart, timePart] = datetime.split(' ');
    const [hour, minute] = timePart.split(':').map(Number);

    let totalMinutes = hour * 60 + minute + minutes;
    const newHour = Math.floor(totalMinutes / 60) % 24;
    const newMinute = totalMinutes % 60;

    return `${datePart} ${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

// 메인 로직
console.log('=== patient_schedule.csv 실제시작시간 업데이트 ===\n');

// 1. constraints.csv 읽기 (소요시간, 장비유형)
const constraintsCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/constraints.csv', 'utf8');
const constraintsData = parseCSV(constraintsCsv);

const codeToInfo = {};
constraintsData.data.forEach(row => {
    codeToInfo[row['처방코드']] = {
        duration: parseInt(row['소요시간']) || 20,
        equipment: row['장비유형']
    };
});

console.log('constraints.csv 로드 완료:', Object.keys(codeToInfo).length + '개 처방코드');

// 2. patient_schedule.csv 읽기
const patientCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/patient_schedule.csv', 'utf8');
const patientData = parseCSV(patientCsv);

console.log('patient_schedule.csv 로드 완료:', patientData.data.length + '개 예약');

// 기존 실제시작시간 컬럼 존재 여부 확인
const hasActualStart = patientData.header.includes('실제시작시간');
console.log(`기존 실제시작시간 컬럼: ${hasActualStart ? '있음 (업데이트 모드)' : '없음 (신규 추가 모드)'}`);

// 3. 같은 환자 + 같은 날짜로 그룹핑 (모든 검사가 순차 진행되어야 함)
const patientDateGroups = {};
patientData.data.forEach((row, idx) => {
    const equipment = codeToInfo[row['처방코드']]?.equipment || 'Unknown';
    const date = row['예약일시'].split(' ')[0];
    const key = `${row['환자번호']}|${date}`;

    if (!patientDateGroups[key]) {
        patientDateGroups[key] = [];
    }
    patientDateGroups[key].push({
        index: idx,
        row: row,
        equipment: equipment,
        duration: codeToInfo[row['처방코드']]?.duration || 20
    });
});

// 그룹 통계
const groupSizes = Object.values(patientDateGroups).map(g => g.length);
const multiGroups = groupSizes.filter(s => s > 1).length;
console.log(`\n환자-날짜 그룹 수: ${Object.keys(patientDateGroups).length}개`);
console.log(`다중 검사 그룹 (2개 이상): ${multiGroups}개`);
console.log(`최대 그룹 크기: ${Math.max(...groupSizes)}개`);

// 4. 각 그룹 내에서 실제시작시간 계산
// 규칙: 같은 예약시간+같은 장비는 연속 진행, 다른 예약시간/장비는 이전 검사 종료 후 시작
const actualStartTimes = new Array(patientData.data.length);

Object.entries(patientDateGroups).forEach(([key, items]) => {
    // 예약일시 순으로 정렬, 같으면 처방ID 순
    items.sort((a, b) => {
        const timeCompare = a.row['예약일시'].localeCompare(b.row['예약일시']);
        if (timeCompare !== 0) return timeCompare;
        return a.row['처방ID'].localeCompare(b.row['처방ID']);
    });

    // 같은 예약시간+같은 장비 서브그룹으로 나누기
    const subGroups = [];
    let currentSubGroup = null;

    items.forEach(item => {
        const subKey = `${item.row['예약일시']}|${item.equipment}`;
        if (!currentSubGroup || currentSubGroup.key !== subKey) {
            currentSubGroup = { key: subKey, items: [], reserveTime: item.row['예약일시'] };
            subGroups.push(currentSubGroup);
        }
        currentSubGroup.items.push(item);
    });

    // 각 서브그룹의 시작시간 계산 (이전 서브그룹 종료 후)
    let lastEndTime = null;

    subGroups.forEach(subGroup => {
        // 서브그룹 시작시간: 예약시간 vs 이전 종료시간 중 늦은 것
        let groupStartTime = subGroup.reserveTime;
        if (lastEndTime && lastEndTime > groupStartTime) {
            groupStartTime = lastEndTime;
        }

        // 서브그룹 내 검사들은 순차 진행
        let currentTime = groupStartTime;
        subGroup.items.forEach(item => {
            actualStartTimes[item.index] = currentTime;
            currentTime = addMinutes(currentTime, item.duration);
        });

        lastEndTime = currentTime;
    });
});

// 5. CSV 생성
let outputHeader;
let newRows;

if (hasActualStart) {
    // 기존 컬럼 업데이트 모드
    outputHeader = patientData.header;
    const actualStartIdx = outputHeader.indexOf('실제시작시간');

    newRows = patientData.data.map((row, idx) => {
        const values = outputHeader.map((h, colIdx) => {
            if (colIdx === actualStartIdx) {
                return actualStartTimes[idx];
            }
            return row[h];
        });
        return values.join(',');
    });
} else {
    // 신규 컬럼 추가 모드
    outputHeader = [...patientData.header];
    const insertIndex = outputHeader.indexOf('예약일시') + 1;
    outputHeader.splice(insertIndex, 0, '실제시작시간');

    newRows = patientData.data.map((row, idx) => {
        const values = patientData.header.map(h => row[h]);
        values.splice(insertIndex, 0, actualStartTimes[idx]);
        return values.join(',');
    });
}

const newCsv = '\uFEFF' + outputHeader.join(',') + '\n' + newRows.join('\n');

// 6. 저장
fs.writeFileSync('c:/Users/user/Desktop/AI_reservation/data/patient_schedule.csv', newCsv, 'utf8');

console.log('\n=== 완료 ===');
console.log('patient_schedule.csv 실제시작시간 업데이트됨');

// 7. 샘플 출력 (다중 검사 그룹 예시)
console.log('\n=== 다중 검사 그룹 예시 ===');
let sampleCount = 0;
Object.entries(patientDateGroups).forEach(([key, items]) => {
    if (items.length > 2 && sampleCount < 3) {
        const [patient, date] = key.split('|');
        console.log(`\n환자 ${patient} @ ${date} (${items.length}개 검사):`);
        items.sort((a, b) => actualStartTimes[a.index].localeCompare(actualStartTimes[b.index]));
        items.forEach(item => {
            console.log(`  ${item.equipment} | 예약: ${item.row['예약일시'].split(' ')[1]} → 실제: ${actualStartTimes[item.index].split(' ')[1]} (${item.duration}분)`);
        });
        sampleCount++;
    }
});
