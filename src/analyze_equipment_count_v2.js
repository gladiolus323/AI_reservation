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

console.log('=== 실제 시작 시간 기반 검사실 개수 재분석 ===\n');

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

console.log('patient_schedule.csv 로드:', patientData.data.length + '개 예약\n');

// 장비유형별 + 날짜별 + 10분 슬롯별 점유 계산
// 각 검사가 실제시작시간부터 소요시간만큼 슬롯 점유
const slotUsage = {}; // { 장비유형|날짜|슬롯 -> 점유 수 }

patientData.data.forEach(row => {
    const code = row['처방코드'];
    const info = codeToInfo[code];
    const actualStart = row['실제시작시간'];

    if (!info || !actualStart) return;

    const equipment = info.equipment;
    const duration = info.duration;
    const { date, minutes: startMinutes } = timeToMinutes(actualStart);

    // 10분 단위 슬롯으로 점유 계산
    const startSlot = Math.floor(startMinutes / 10);
    const endSlot = Math.ceil((startMinutes + duration) / 10);

    for (let slot = startSlot; slot < endSlot; slot++) {
        const key = `${equipment}|${date}|${slot}`;
        slotUsage[key] = (slotUsage[key] || 0) + 1;
    }
});

// 장비유형별 최대 동시 사용 수 계산
const maxByEquipment = {};
Object.entries(slotUsage).forEach(([key, count]) => {
    const [equipment, date, slot] = key.split('|');
    const slotNum = parseInt(slot);
    const hour = Math.floor(slotNum * 10 / 60);
    const minute = (slotNum * 10) % 60;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    if (!maxByEquipment[equipment]) {
        maxByEquipment[equipment] = { max: 0, when: '', date: '' };
    }
    if (count > maxByEquipment[equipment].max) {
        maxByEquipment[equipment] = {
            max: count,
            when: timeStr,
            date: date
        };
    }
});

// 결과 출력
console.log('| 장비유형 | 필요 검사실 수 | 근거 (최대 동시 점유 시점) |');
console.log('|----------|---------------|--------------------------|');

const sorted = Object.entries(maxByEquipment).sort((a, b) => b[1].max - a[1].max);
sorted.forEach(([equipment, data]) => {
    console.log(`| ${equipment} | ${data.max}개 | ${data.date} ${data.when}에 ${data.max}개 슬롯 동시 점유 |`);
});

// 총계
const total = Object.values(maxByEquipment).reduce((sum, d) => sum + d.max, 0);
console.log(`\n=== 총 검사실 수: ${total}개 ===`);

// 이전 분석과 비교
console.log('\n=== 이전 분석 vs 새 분석 비교 ===');
const previous = {
    'CT': 4,
    '초음파(US)': 3,
    'SPECT/Gamma Camera': 3,
    'MRI': 2,
    '청력검사실': 2,
    '신경심리검사실': 2,
    '폐기능검사실': 2,
    '동맥경화도검사실': 1,
    '내시경실': 1,
    '심초음파실': 1,
    '홀터/ABPM': 1,
    '전정기능검사실': 1,
    '신경과기타': 1,
    'EMG/NCV검사실': 1,
    'PET-CT': 1,
    '자율신경검사실': 1,
    '뇌파검사실(EEG)': 1,
    '투시촬영': 1,
    '운동부하검사실': 1
};

console.log('\n| 장비유형 | 이전 | 새 분석 | 차이 |');
console.log('|----------|------|--------|------|');

sorted.forEach(([equipment, data]) => {
    const prev = previous[equipment] || 1;
    const diff = data.max - prev;
    const diffStr = diff > 0 ? `+${diff}` : (diff < 0 ? `${diff}` : '0');
    console.log(`| ${equipment} | ${prev}개 | ${data.max}개 | ${diffStr} |`);
});

// 분포 분석 (주요 장비만)
console.log('\n=== 주요 장비 슬롯 점유 분포 ===');
['청력검사실', 'EMG/NCV검사실', '심초음파실', 'MRI', '동맥경화도검사실'].forEach(equipment => {
    const distribution = {};
    Object.entries(slotUsage).forEach(([key, count]) => {
        if (key.startsWith(equipment + '|')) {
            distribution[count] = (distribution[count] || 0) + 1;
        }
    });

    console.log(`\n${equipment}:`);
    Object.entries(distribution)
        .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
        .slice(0, 5)
        .forEach(([count, freq]) => {
            console.log(`  ${count}개 동시 점유: ${freq}회`);
        });
});
