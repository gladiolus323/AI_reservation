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
    if (!datetime || !datetime.includes(' ')) return null;
    const [datePart, timePart] = datetime.split(' ');
    if (!timePart || !timePart.includes(':')) return null;
    const [hour, minute] = timePart.split(':').map(Number);
    return { date: datePart, minutes: hour * 60 + minute };
}

console.log('=== 환자별 검사 시간 중복 검증 ===\n');

// 1. constraints.csv 읽기
const constraintsCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/constraints.csv', 'utf8');
const constraintsData = parseCSV(constraintsCsv);

const codeToInfo = {};
constraintsData.data.forEach(row => {
    codeToInfo[row['처방코드']] = {
        name: row['처방명'],
        duration: parseInt(row['소요시간']) || 20,
        equipment: row['장비유형']
    };
});

console.log(`constraints.csv: ${Object.keys(codeToInfo).length}개 처방코드 로드`);

// 2. patient_schedule.csv 읽기
const patientCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/patient_schedule.csv', 'utf8');
const patientData = parseCSV(patientCsv);

console.log(`patient_schedule.csv: ${patientData.data.length}개 예약 로드`);
console.log(`컬럼: ${patientData.header.join(', ')}`);

// 실제시작시간 컬럼 존재 여부 확인
const hasActualStart = patientData.header.includes('실제시작시간');
console.log(`\n실제시작시간 컬럼 존재: ${hasActualStart ? 'O' : 'X'}`);

// 3. 환자+날짜별 그룹핑
const patientDateGroups = {};
let missingActualStart = 0;

patientData.data.forEach((row, idx) => {
    const code = row['처방코드'];
    const info = codeToInfo[code];
    if (!info) return;

    const reserveTime = row['예약일시'];
    if (!reserveTime) return;

    const date = reserveTime.split(' ')[0];
    const key = `${row['환자번호']}|${date}`;

    // 실제시작시간 확인
    let actualStart = row['실제시작시간'];
    if (!actualStart || actualStart === '') {
        missingActualStart++;
        actualStart = reserveTime; // 없으면 예약시간 사용
    }

    if (!patientDateGroups[key]) {
        patientDateGroups[key] = [];
    }
    patientDateGroups[key].push({
        처방ID: row['처방ID'],
        처방코드: code,
        처방명: info.name,
        장비유형: info.equipment,
        소요시간: info.duration,
        예약일시: reserveTime,
        실제시작시간: actualStart,
        idx: idx
    });
});

console.log(`\n환자-날짜 그룹 수: ${Object.keys(patientDateGroups).length}개`);
console.log(`실제시작시간 누락: ${missingActualStart}건`);

// 4. 중복 검사
const overlaps = [];

Object.entries(patientDateGroups).forEach(([key, items]) => {
    if (items.length < 2) return;

    // 실제시작시간 순으로 정렬
    items.sort((a, b) => a.실제시작시간.localeCompare(b.실제시작시간));

    // 각 검사 쌍에 대해 시간 중복 체크
    for (let i = 0; i < items.length; i++) {
        const item1 = items[i];
        const time1 = timeToMinutes(item1.실제시작시간);
        if (!time1) continue;

        const end1 = time1.minutes + item1.소요시간;

        for (let j = i + 1; j < items.length; j++) {
            const item2 = items[j];
            const time2 = timeToMinutes(item2.실제시작시간);
            if (!time2) continue;

            const end2 = time2.minutes + item2.소요시간;

            // 시간 중복 체크: item1의 종료시간 > item2의 시작시간
            if (end1 > time2.minutes) {
                overlaps.push({
                    환자번호: key.split('|')[0],
                    날짜: key.split('|')[1],
                    검사1: {
                        처방ID: item1.처방ID,
                        처방명: item1.처방명,
                        장비유형: item1.장비유형,
                        시작: item1.실제시작시간.split(' ')[1],
                        종료: `${Math.floor(end1/60).toString().padStart(2,'0')}:${(end1%60).toString().padStart(2,'0')}`,
                        소요시간: item1.소요시간
                    },
                    검사2: {
                        처방ID: item2.처방ID,
                        처방명: item2.처방명,
                        장비유형: item2.장비유형,
                        시작: item2.실제시작시간.split(' ')[1],
                        종료: `${Math.floor(end2/60).toString().padStart(2,'0')}:${(end2%60).toString().padStart(2,'0')}`,
                        소요시간: item2.소요시간
                    },
                    중복시간: end1 - time2.minutes
                });
            }
        }
    }
});

console.log(`\n=== 검증 결과 ===`);
console.log(`시간 중복 케이스: ${overlaps.length}건`);

if (overlaps.length > 0) {
    // 장비유형별 중복 통계
    const overlapByEquip = {};
    overlaps.forEach(o => {
        const key = `${o.검사1.장비유형} ↔ ${o.검사2.장비유형}`;
        if (!overlapByEquip[key]) overlapByEquip[key] = [];
        overlapByEquip[key].push(o);
    });

    console.log(`\n=== 장비유형 조합별 중복 ===`);
    Object.entries(overlapByEquip)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([key, items]) => {
            console.log(`${key}: ${items.length}건`);
        });

    // 샘플 출력
    console.log(`\n=== 중복 샘플 (처음 10건) ===`);
    overlaps.slice(0, 10).forEach((o, i) => {
        console.log(`\n[${i+1}] 환자 ${o.환자번호} @ ${o.날짜}`);
        console.log(`  검사1: ${o.검사1.처방명} (${o.검사1.장비유형})`);
        console.log(`         ${o.검사1.시작} ~ ${o.검사1.종료} (${o.검사1.소요시간}분)`);
        console.log(`  검사2: ${o.검사2.처방명} (${o.검사2.장비유형})`);
        console.log(`         ${o.검사2.시작} ~ ${o.검사2.종료} (${o.검사2.소요시간}분)`);
        console.log(`  → 중복: ${o.중복시간}분`);
    });

    // 같은 장비유형 내 중복 vs 다른 장비유형 간 중복
    const sameEquipOverlaps = overlaps.filter(o => o.검사1.장비유형 === o.검사2.장비유형);
    const diffEquipOverlaps = overlaps.filter(o => o.검사1.장비유형 !== o.검사2.장비유형);

    console.log(`\n=== 중복 유형 분석 ===`);
    console.log(`같은 장비유형 내 중복: ${sameEquipOverlaps.length}건`);
    console.log(`다른 장비유형 간 중복: ${diffEquipOverlaps.length}건`);

    if (diffEquipOverlaps.length > 0) {
        console.log(`\n[주의] 다른 장비유형 간 중복은 환자가 동시에 두 검사실에 있어야 하는 상황!`);
        console.log(`\n다른 장비유형 간 중복 샘플:`);
        diffEquipOverlaps.slice(0, 5).forEach((o, i) => {
            console.log(`\n[${i+1}] 환자 ${o.환자번호} @ ${o.날짜}`);
            console.log(`  ${o.검사1.장비유형}: ${o.검사1.시작}~${o.검사1.종료}`);
            console.log(`  ${o.검사2.장비유형}: ${o.검사2.시작}~${o.검사2.종료}`);
            console.log(`  → 중복 ${o.중복시간}분`);
        });
    }
} else {
    console.log(`\n✓ 모든 환자의 검사 시간이 겹치지 않습니다!`);
}

// 5. 다중 검사 환자 샘플 출력
console.log(`\n=== 다중 검사 환자 샘플 (정상 케이스) ===`);
let sampleCount = 0;
Object.entries(patientDateGroups).forEach(([key, items]) => {
    if (items.length >= 3 && sampleCount < 3) {
        // 중복이 없는 케이스만
        const hasOverlap = overlaps.some(o =>
            o.환자번호 === key.split('|')[0] && o.날짜 === key.split('|')[1]
        );
        if (hasOverlap) return;

        items.sort((a, b) => a.실제시작시간.localeCompare(b.실제시작시간));
        const [patient, date] = key.split('|');
        console.log(`\n환자 ${patient} @ ${date} (${items.length}개 검사):`);
        items.forEach(item => {
            const time = timeToMinutes(item.실제시작시간);
            const endMin = time.minutes + item.소요시간;
            const endTime = `${Math.floor(endMin/60).toString().padStart(2,'0')}:${(endMin%60).toString().padStart(2,'0')}`;
            console.log(`  ${item.장비유형}: ${item.실제시작시간.split(' ')[1]} ~ ${endTime} (${item.소요시간}분)`);
        });
        sampleCount++;
    }
});
