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

// 시간 계산 함수
function addMinutes(datetime, minutes) {
    const [datePart, timePart] = datetime.split(' ');
    const [hour, minute] = timePart.split(':').map(Number);
    let totalMinutes = hour * 60 + minute + minutes;
    const newHour = Math.floor(totalMinutes / 60) % 24;
    const newMinute = totalMinutes % 60;
    return `${datePart} ${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

function timeToMinutes(datetime) {
    const [datePart, timePart] = datetime.split(' ');
    const [hour, minute] = timePart.split(':').map(Number);
    return { date: datePart, minutes: hour * 60 + minute };
}

console.log('=== 소요시간 수정 후 시뮬레이션 ===\n');

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

// 수정된 소요시간 (제안)
const newDurations = {
    // 청력검사실
    'SC140005': 15,  // PTA: 30 -> 15
    'SC140006': 10,  // IA(Impedance): 30 -> 10
    'SC140007': 15,  // Tinnitus test: 30 -> 15
    'SC140008': 15,  // Speech Audiometry: 30 -> 15
    'SC140009': 10,  // ART: 30 -> 10
    'SC140010': 10,  // OAE: 30 -> 10
    'SC140011': 30,  // BERA: 유지

    // EMG/NCV검사실
    'SC160019': 30,  // EMG 상지: 45 -> 30
    'SC160020': 30,  // EMG 하지: 45 -> 30
    'SC160021': 30,  // EMG 구간: 45 -> 30
    'SC160023': 20,  // NCV 상지 운동: 45 -> 20
    'SC160024': 20,  // NCV 상지 감각: 45 -> 20
    'SC160025': 20,  // NCV 하지 운동: 45 -> 20
    'SC160026': 20,  // NCV 하지 감각: 45 -> 20
    'SC160027': 20,  // NCV 두부: 45 -> 20
    'SC160029': 30,  // Nerve Excitability: 45 -> 30
    'SC160030': 30,  // Blink Reflex: 45 -> 30
    'SC160039': 15,  // F파 상지: 45 -> 15
    'SC160040': 15,  // F파 하지: 45 -> 15
    'SC160041': 15,  // H반사: 45 -> 15

    // MRI (일부 조정)
    // MRI는 실제로 30-60분 걸리므로 45분 유지가 적절할 수 있음

    // 심초음파실
    'SC010007': 20,  // 경흉부 심초음파: 30 -> 20
    'SC010009': 20,
    'SC010010': 20,
    'SC010016': 20,
    'SC010022': 15,  // Carotid IMT: 30 -> 15
};

// 수정된 소요시간 적용
const modifiedCodeToInfo = {};
Object.entries(codeToInfo).forEach(([code, info]) => {
    modifiedCodeToInfo[code] = {
        ...info,
        duration: newDurations[code] || info.duration
    };
});

// patient_schedule.csv 읽기
const patientCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/patient_schedule.csv', 'utf8');
const patientData = parseCSV(patientCsv);

// 실제시작시간 재계산 (수정된 소요시간 기준)
// 같은 환자 + 같은 예약일시 + 같은 장비유형으로 그룹핑
const groups = {};
patientData.data.forEach((row, idx) => {
    const equipment = modifiedCodeToInfo[row['처방코드']]?.equipment || 'Unknown';
    const key = `${row['환자번호']}|${row['예약일시']}|${equipment}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
        index: idx,
        row: row,
        duration: modifiedCodeToInfo[row['처방코드']]?.duration || 20
    });
});

// 순차 배치하여 실제시작시간 재계산
const newActualStartTimes = new Array(patientData.data.length);
Object.entries(groups).forEach(([key, items]) => {
    items.sort((a, b) => a.row['처방ID'].localeCompare(b.row['처방ID']));
    let currentTime = items[0].row['예약일시'];
    items.forEach((item) => {
        newActualStartTimes[item.index] = currentTime;
        currentTime = addMinutes(currentTime, item.duration);
    });
});

// 장비유형별 + 날짜별 + 10분 슬롯별 점유 계산
const slotUsage = {};
patientData.data.forEach((row, idx) => {
    const code = row['처방코드'];
    const info = modifiedCodeToInfo[code];
    const actualStart = newActualStartTimes[idx];

    if (!info || !actualStart) return;

    const equipment = info.equipment;
    const duration = info.duration;
    const { date, minutes: startMinutes } = timeToMinutes(actualStart);

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
        maxByEquipment[equipment] = { max: count, when: timeStr, date: date };
    }
});

// 이전 분석 결과 (수정 전)
const before = {
    '청력검사실': 7, 'CT': 5, 'MRI': 4, '신경심리검사실': 4,
    '초음파(US)': 3, '심초음파실': 3, 'SPECT/Gamma Camera': 3,
    '폐기능검사실': 3, 'EMG/NCV검사실': 3, '동맥경화도검사실': 2,
    '내시경실': 2, '전정기능검사실': 2, 'PET-CT': 2, '자율신경검사실': 2,
    '홀터/ABPM': 1, '신경과기타': 1, '뇌파검사실(EEG)': 1, '투시촬영': 1, '운동부하검사실': 1
};

// 결과 비교
console.log('| 장비유형 | 수정 전 | 수정 후 | 변화 | 현실적? |');
console.log('|----------|--------|--------|------|--------|');

const sorted = Object.entries(maxByEquipment).sort((a, b) => b[1].max - a[1].max);
sorted.forEach(([equipment, data]) => {
    const prev = before[equipment] || 1;
    const diff = data.max - prev;
    const diffStr = diff > 0 ? `+${diff}` : (diff < 0 ? `${diff}` : '0');
    const realistic = data.max <= 2 ? '✅' : (data.max <= 3 ? '⚠️' : '❌');
    console.log(`| ${equipment} | ${prev}개 | ${data.max}개 | ${diffStr} | ${realistic} |`);
});

const totalBefore = Object.values(before).reduce((a, b) => a + b, 0);
const totalAfter = Object.values(maxByEquipment).reduce((sum, d) => sum + d.max, 0);
console.log(`\n총 검사실: ${totalBefore}개 → ${totalAfter}개`);

// 문제 장비 상세 분석
console.log('\n\n=== 여전히 문제인 장비 상세 분석 ===');
['청력검사실', 'EMG/NCV검사실', '심초음파실', 'MRI'].forEach(equipment => {
    const data = maxByEquipment[equipment];
    if (data && data.max > 2) {
        console.log(`\n${equipment}: ${data.max}개 필요 @ ${data.date} ${data.when}`);

        // 해당 시점 상세 분석
        const targetSlot = Math.floor((parseInt(data.when.split(':')[0]) * 60 + parseInt(data.when.split(':')[1])) / 10);
        const targetKey = `${equipment}|${data.date}|${targetSlot}`;

        // 해당 시간대 예약 찾기
        console.log('  해당 시간대 예약:');
        patientData.data.forEach((row, idx) => {
            const code = row['처방코드'];
            const info = modifiedCodeToInfo[code];
            if (info?.equipment !== equipment) return;

            const actualStart = newActualStartTimes[idx];
            if (!actualStart) return;

            const { date, minutes } = timeToMinutes(actualStart);
            if (date !== data.date) return;

            const startSlot = Math.floor(minutes / 10);
            const endSlot = Math.ceil((minutes + info.duration) / 10);

            if (startSlot <= targetSlot && targetSlot < endSlot) {
                const endTime = addMinutes(actualStart, info.duration);
                console.log(`    ${row['환자번호']} | ${code} | ${actualStart} ~ ${endTime} (${info.duration}분)`);
            }
        });
    }
});
