import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '../../data');

// CSV 파싱 함수 (따옴표 처리 포함)
function parseCSV(text) {
    const lines = text.split('\n');
    let header = lines[0];
    // BOM 제거
    if (header.charCodeAt(0) === 0xFEFF) {
        header = header.slice(1);
    }
    const headers = header.split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const row = [];
        let current = '';
        let inQuotes = false;

        for (const char of lines[i]) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        row.push(current.trim());

        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = row[idx] || '';
        });
        data.push(obj);
    }
    return data;
}

// 데이터 캐시
let patientSchedule = null;
let resourceSchedule = null;
let constraints = null;

// 환자 스케줄 로드
export function loadPatientSchedule() {
    if (patientSchedule) return patientSchedule;

    const filePath = path.join(dataDir, 'patient_schedule.csv');
    const text = fs.readFileSync(filePath, 'utf-8');
    patientSchedule = parseCSV(text);
    console.error(`[data-loader] patient_schedule.csv 로드: ${patientSchedule.length}건`);
    return patientSchedule;
}

// 리소스 스케줄 로드
export function loadResourceSchedule() {
    if (resourceSchedule) return resourceSchedule;

    const filePath = path.join(dataDir, 'resource_schedule.csv');
    const text = fs.readFileSync(filePath, 'utf-8');
    resourceSchedule = parseCSV(text);
    console.error(`[data-loader] resource_schedule.csv 로드: ${resourceSchedule.length}건`);
    return resourceSchedule;
}

// 제약조건 로드
export function loadConstraints() {
    if (constraints) return constraints;

    const filePath = path.join(dataDir, 'constraints.csv');
    const text = fs.readFileSync(filePath, 'utf-8');
    constraints = parseCSV(text);
    console.error(`[data-loader] constraints.csv 로드: ${constraints.length}건`);
    return constraints;
}

// 모든 데이터 로드
export function loadAllData() {
    return {
        patientSchedule: loadPatientSchedule(),
        resourceSchedule: loadResourceSchedule(),
        constraints: loadConstraints()
    };
}

// 데이터 캐시 초기화 (테스트용)
export function clearCache() {
    patientSchedule = null;
    resourceSchedule = null;
    constraints = null;
}
