const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Excel 시리얼 날짜를 JavaScript Date로 변환
function excelSerialToDate(serial) {
    if (!serial || typeof serial !== 'number') return null;
    const excelEpoch = new Date(1899, 11, 30);
    const days = Math.floor(serial);
    const timeFraction = serial - days;
    const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    const totalSeconds = Math.round(timeFraction * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    date.setHours(hours, minutes, 0, 0);
    return date;
}

// 날짜에 1년 추가
function addOneYear(date) {
    if (!date) return null;
    const newDate = new Date(date);
    newDate.setFullYear(newDate.getFullYear() + 1);
    return newDate;
}

// 날짜를 YYYY-MM-DD HH:mm 형식으로 포맷
function formatDateTime(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 날짜를 YYYY-MM-DD 형식으로 포맷
function formatDate(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 메인 로직
const workbook = XLSX.readFile(path.join(__dirname, '../data/source.xlsx'));
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet);

// CSV 헤더 (처방일자 제외)
const headers = ['처방ID', '환자번호', '처방분류', '처방코드', '처방명', '환자수진부서', '예약일시', '외래예약총건수', '외래예약건수최근1년', '가장빠른외래예약일자'];

// 데이터 변환
const rows = data.map(row => {
    // 예약일시 변환 및 1년 추가
    const originalDate = excelSerialToDate(row['예약일시']);
    const newDate = addOneYear(originalDate);
    const formattedDateTime = formatDateTime(newDate);

    // 가장빠른외래예약일자도 변환 (시간 없이 날짜만)
    let earliestDate = '';
    if (row['가장빠른외래예약일자']) {
        const origEarliest = excelSerialToDate(row['가장빠른외래예약일자']);
        const newEarliest = addOneYear(origEarliest);
        earliestDate = formatDate(newEarliest);
    }

    return [
        row['처방ID'] || '',
        row['환자번호'] || '',
        row['처방분류'] || '',
        row['처방코드'] || '',
        row['처방명'] || '',
        row['환자수진부서'] || '',
        formattedDateTime,
        row['외래예약총건수'] || '',
        row['외래예약건수최근1년'] || '',
        earliestDate
    ];
});

// CSV 생성
const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }).join(','))
].join('\n');

// 파일 저장
const outputPath = path.join(__dirname, '../data/patient_schedule.csv');
fs.writeFileSync(outputPath, csvContent, 'utf8');

console.log(`patient_schedule.csv 생성 완료: ${rows.length}건`);
console.log(`저장 경로: ${outputPath}`);
