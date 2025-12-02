const fs = require('fs');

const csv = fs.readFileSync('c:/Users/user/Desktop/AI_reservation/data/patient_schedule.csv', 'utf8');
const lines = csv.split('\n').slice(1).filter(l => l.trim());

// 파싱
const reservations = [];
lines.forEach(line => {
    const parts = line.split(',');
    if (parts.length >= 7) {
        reservations.push({
            id: parts[0],
            patient: parts[1],
            category: parts[2],
            code: parts[3],
            name: parts[4],
            datetime: parts[6]
        });
    }
});

// 2025-08-09 09:00에 예약된 건들
const target = reservations.filter(r => r.datetime && r.datetime.includes('2025-08-09 09:00'));
console.log('2025-08-09 09:00 예약 건수:', target.length);
console.log('');

// 환자별로 그룹핑
const byPatient = {};
target.forEach(r => {
    if (!byPatient[r.patient]) byPatient[r.patient] = [];
    byPatient[r.patient].push(r);
});

console.log('=== 환자별 예약 ===');
Object.entries(byPatient).forEach(([patient, list]) => {
    if (list.length > 1) {
        console.log('환자 ' + patient + ': ' + list.length + '건');
        list.forEach(r => console.log('  - ' + r.code + ' | ' + r.name + ' | ' + r.category));
    }
});

// 전체 데이터에서 동일 환자+동일 시간에 여러 예약이 있는 경우 통계
console.log('\n=== 전체 데이터 중 동일시간 중복 예약 통계 ===');
const allByPatientTime = {};
reservations.forEach(r => {
    const key = r.patient + '|' + r.datetime;
    if (!allByPatientTime[key]) allByPatientTime[key] = [];
    allByPatientTime[key].push(r);
});

let duplicateCount = 0;
let maxDuplicate = 0;
Object.entries(allByPatientTime).forEach(([key, list]) => {
    if (list.length > 1) {
        duplicateCount++;
        if (list.length > maxDuplicate) maxDuplicate = list.length;
    }
});

console.log('동일 환자+동일 시간 중복 케이스:', duplicateCount + '건');
console.log('최대 중복 수:', maxDuplicate + '개');

// 가장 많이 중복된 케이스 출력
console.log('\n=== 9개 이상 중복된 케이스 ===');
Object.entries(allByPatientTime).forEach(([key, list]) => {
    if (list.length >= 9) {
        const [patient, datetime] = key.split('|');
        console.log('\n환자 ' + patient + ' @ ' + datetime + ' (' + list.length + '건):');
        list.forEach(r => console.log('  - ' + r.code + ' | ' + r.name));
    }
});
