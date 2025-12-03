import fs from 'fs';
import path from 'path';
import { loadPatientSchedule, loadConstraints } from '../mcp-server/src/data-loader.js';

// Build patient -> existing exam codes map (normalized to uppercase)
const patients = loadPatientSchedule();
const constraints = loadConstraints();

const patientKeys = Object.keys(patients[0]);
const pidKey = patientKeys[1];
const codeKey = patientKeys[3];

const constraintKeys = Object.keys(constraints[0]);
const examCodeKey = constraintKeys[0];
const examNameKey = constraintKeys[1];

const patientCodes = new Map();
for (const row of patients) {
  const pid = row[pidKey];
  const code = row[codeKey];
  if (!pid || !code) continue;
  const set = patientCodes.get(pid) || new Set();
  set.add(code.trim().toUpperCase());
  patientCodes.set(pid, set);
}

const preferences = [
  '다음 주 화/목 오후 2~4시 선호, 오전은 피하고 싶어요',
  '이번 달 셋째 주 수요일 10~12시가 좋아요',
  '주말 제외, 월/화 오전 9~11시 중 비는 시간으로 잡아주세요',
  '금식 검사라 오후 1~3시만 가능해요. 다음 주 화/수 부탁해요',
  '목요일 15~17시 우선, 없으면 금요일 같은 시간대로',
  '다음 주 초(월~수) 오후 2시 이후만 가능해요',
  '출근 전 9~10시 위주로 부탁해요. 화/목 우선',
  '아이 돌봄 때문에 16시 이전만 가능해요. 수/목 선호',
  '퇴근 후 16~17시 타임이면 좋아요. 화/수/목 중',
  '다음 달 첫째 주 화/수 오전 11시 근처 시간이면 좋겠어요'
];

const purposes = [
  '신규 처방 코드 슬롯 추천 기본 검증',
  '주말 제외 및 오전/오후 시간대 필터 확인',
  '금식·오후 선호 조건 반영 확인',
  '요일 우선순위(화/목) 반영 검증',
  '퇴근 전/후 시간대 제약 반영 검증'
];

const rows = [['patient_id', 'exam_code', 'exam_name', 'preference', 'test_purpose']];
const patientIds = Array.from(patientCodes.keys());

let idx = 0;
let attempts = 0;
while (rows.length < 101 && attempts < 5000) {
  attempts += 1;
  const pid = patientIds[idx % patientIds.length];
  idx += 1;
  const used = patientCodes.get(pid) || new Set();

  // pick the first constraint not already used by this patient
  const candidate = constraints.find((c) => {
    const code = (c[examCodeKey] || '').trim().toUpperCase();
    return code && !used.has(code);
  });
  if (!candidate) continue;

  const code = (candidate[examCodeKey] || '').trim().toUpperCase();
  const name = candidate[examNameKey] || '';
  const preference = preferences[rows.length % preferences.length];
  const purpose = purposes[rows.length % purposes.length];

  rows.push([pid, code, name, preference, purpose]);
}

if (rows.length < 101) {
  throw new Error(`generation failed: only ${rows.length - 1} rows`);
}

fs.mkdirSync('test', { recursive: true });
const csvBody = rows
  .map((row) =>
    row
      .map((v) => {
        const str = (v ?? '').toString();
        return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
      })
      .join(',')
  )
  .join('\n');

const csvWithBom = `\uFEFF${csvBody}`;
fs.writeFileSync(path.join('test', 'new_reservation_scenarios.csv'), csvWithBom, 'utf8');
console.log('rows:', rows.length - 1, 'written to test/new_reservation_scenarios.csv');
