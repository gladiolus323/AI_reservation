import { getPatientInfo } from './tools/get-patient-info.js';

console.log('=== 환자 정보 조회 테스트 ===\n');

// 존재하는 환자
const result1 = getPatientInfo('00005722');
console.log('환자 00005722:');
console.log(JSON.stringify(result1, null, 2));

console.log('\n---\n');

// 존재하지 않는 환자
const result2 = getPatientInfo('99999999');
console.log('환자 99999999:');
console.log(JSON.stringify(result2, null, 2));
