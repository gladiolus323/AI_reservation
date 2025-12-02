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

console.log('=== 검사 소요시간 문제 분석 ===\n');

// constraints.csv 읽기
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

// patient_schedule.csv 읽기
const patientCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/patient_schedule.csv', 'utf8');
const patientData = parseCSV(patientCsv);

// 문제 장비 목록
const problemEquipments = ['청력검사실', 'EMG/NCV검사실', '심초음파실', 'MRI', '신경심리검사실'];

// 장비별 검사 소요시간 분석
problemEquipments.forEach(equipment => {
    console.log(`\n=== ${equipment} ===`);

    // 해당 장비의 검사 목록
    const tests = {};
    Object.entries(codeToInfo).forEach(([code, info]) => {
        if (info.equipment === equipment) {
            tests[code] = { ...info, count: 0 };
        }
    });

    // 예약에서 사용 횟수 카운트
    patientData.data.forEach(row => {
        const code = row['처방코드'];
        if (tests[code]) {
            tests[code].count++;
        }
    });

    // 사용 횟수 순으로 정렬
    const sorted = Object.entries(tests)
        .filter(([_, info]) => info.count > 0)
        .sort((a, b) => b[1].count - a[1].count);

    console.log('| 처방코드 | 처방명 | 현재 소요시간 | 예약 수 |');
    console.log('|----------|--------|--------------|--------|');
    sorted.forEach(([code, info]) => {
        const shortName = info.name.length > 25 ? info.name.substring(0, 25) + '...' : info.name;
        console.log(`| ${code} | ${shortName} | ${info.duration}분 | ${info.count}건 |`);
    });

    // 총 소요시간 합계
    const totalDuration = sorted.reduce((sum, [_, info]) => sum + info.duration * info.count, 0);
    const avgDuration = sorted.length > 0 ? (totalDuration / sorted.reduce((sum, [_, info]) => sum + info.count, 0)).toFixed(1) : 0;
    console.log(`\n평균 소요시간: ${avgDuration}분`);
});

// 청력검사실 상세 분석 - 연속 검사 패턴
console.log('\n\n=== 청력검사실 연속 검사 패턴 분석 ===');

// 같은 환자 + 같은 예약시간의 청력검사 그룹
const hearingGroups = {};
patientData.data.forEach(row => {
    const equipment = codeToInfo[row['처방코드']]?.equipment;
    if (equipment === '청력검사실') {
        const key = `${row['환자번호']}|${row['예약일시']}`;
        if (!hearingGroups[key]) hearingGroups[key] = [];
        hearingGroups[key].push({
            code: row['처방코드'],
            name: codeToInfo[row['처방코드']]?.name,
            duration: codeToInfo[row['처방코드']]?.duration
        });
    }
});

// 그룹 크기 분포
const groupSizes = {};
Object.values(hearingGroups).forEach(group => {
    const size = group.length;
    groupSizes[size] = (groupSizes[size] || 0) + 1;
});

console.log('\n연속 검사 그룹 크기 분포:');
Object.entries(groupSizes).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).forEach(([size, count]) => {
    const totalTime = parseInt(size) * 30; // 현재 30분씩
    console.log(`  ${size}개 연속: ${count}건 (총 소요시간: ${totalTime}분)`);
});

// 4개 연속 검사 예시
console.log('\n4개 연속 검사 예시:');
let sampleCount = 0;
Object.entries(hearingGroups).forEach(([key, group]) => {
    if (group.length === 4 && sampleCount < 2) {
        const [patient, datetime] = key.split('|');
        const totalTime = group.reduce((sum, g) => sum + g.duration, 0);
        console.log(`  ${datetime}: ${group.map(g => g.code).join(', ')} (총 ${totalTime}분)`);
        sampleCount++;
    }
});

console.log('\n\n=== 소요시간 수정 제안 ===');
console.log('\n청력검사실 (현재 30분 → 제안):');
console.log('  PTA: 30분 → 15분');
console.log('  IA(Impedance): 30분 → 10분');
console.log('  Speech Audiometry: 30분 → 15분');
console.log('  OAE: 30분 → 10분');
console.log('  ART: 30분 → 10분');
console.log('  Tinnitus test: 30분 → 15분');
console.log('  BERA: 30분 → 30분 (유지)');

console.log('\n→ 4개 연속 검사: 120분 → 50분');
