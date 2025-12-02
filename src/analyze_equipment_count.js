const fs = require('fs');

// CSV 파싱 함수 (JSON 내부 쉼표 처리)
function parseCSV(csvData) {
    // BOM 제거
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

        const cleanRow = row.map(cell => {
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

// patient_schedule.csv 읽기
const patientCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/patient_schedule.csv', 'utf8');
const patientData = parseCSV(patientCsv);

// constraints.csv 읽기
const constraintsCsv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/constraints.csv', 'utf8');
const constraintsData = parseCSV(constraintsCsv);

const codeToEquipment = {};
const codeToDuration = {};
constraintsData.data.forEach(row => {
    codeToEquipment[row['처방코드']] = row['장비유형'];
    codeToDuration[row['처방코드']] = parseInt(row['소요시간']) || 20;
});

// 예약 파싱
const reservations = patientData.data.map(row => ({
    id: row['처방ID'],
    patient: row['환자번호'],
    code: row['처방코드'],
    name: row['처방명'],
    datetime: row['예약일시'],
    equipment: codeToEquipment[row['처방코드']] || 'Unknown',
    duration: codeToDuration[row['처방코드']] || 20
}));

console.log('총 예약 수:', reservations.length);
console.log('장비유형 목록:', [...new Set(reservations.map(r => r.equipment))].join(', '));

// 장비유형별 + 날짜+시간별로 그룹핑
// 같은 환자의 같은 시간 검사는 1개로 카운트 (연속 검사이므로)
const slotUsage = {};

reservations.forEach(r => {
    if (!r.datetime || r.equipment === 'Unknown') return;

    const key = r.equipment + '|' + r.datetime;
    if (!slotUsage[key]) {
        slotUsage[key] = new Set();
    }
    slotUsage[key].add(r.patient);
});

// 장비유형별 최대 동시 사용 수 계산
const maxByEquipment = {};
Object.entries(slotUsage).forEach(([key, patients]) => {
    const [equipment, datetime] = key.split('|');
    const count = patients.size;

    if (!maxByEquipment[equipment]) {
        maxByEquipment[equipment] = { max: 0, when: '', patients: [] };
    }
    if (count > maxByEquipment[equipment].max) {
        maxByEquipment[equipment] = {
            max: count,
            when: datetime,
            patients: [...patients]
        };
    }
});

// 결과 출력
console.log('\n=== 장비유형별 필요 검사실 수 (최대 동시 사용 환자 수 기준) ===\n');
console.log('| 장비유형 | 필요 검사실 수 | 근거 (최대 동시 사용 시점) |');
console.log('|----------|---------------|--------------------------|');

Object.entries(maxByEquipment)
    .sort((a, b) => b[1].max - a[1].max)
    .forEach(([equipment, data]) => {
        console.log(`| ${equipment} | ${data.max}개 | ${data.when}에 ${data.max}명 동시 |`);
    });

// 총계
const total = Object.values(maxByEquipment).reduce((sum, d) => sum + d.max, 0);
console.log(`\n=== 총 검사실 수: ${total}개 ===`);

// 상세 분석
console.log('\n\n=== 상세 분석: 장비유형별 동시 사용 분포 ===\n');

Object.entries(maxByEquipment)
    .sort((a, b) => b[1].max - a[1].max)
    .forEach(([equipment, data]) => {
        const usageBySlot = {};
        Object.entries(slotUsage).forEach(([key, patients]) => {
            if (key.startsWith(equipment + '|')) {
                usageBySlot[key.split('|')[1]] = patients.size;
            }
        });

        const distribution = {};
        Object.values(usageBySlot).forEach(count => {
            distribution[count] = (distribution[count] || 0) + 1;
        });

        console.log(`${equipment}:`);
        console.log(`  최대 동시 사용: ${data.max}명 @ ${data.when}`);
        console.log(`  분포: ` + Object.entries(distribution)
            .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
            .map(([count, freq]) => `${count}명동시:${freq}회`)
            .join(', '));
        console.log('');
    });
