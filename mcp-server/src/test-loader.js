import { loadAllData } from './data-loader.js';

const data = loadAllData();

console.log('=== 데이터 로드 테스트 ===');
console.log(`환자 스케줄: ${data.patientSchedule.length}건`);
console.log(`리소스 스케줄: ${data.resourceSchedule.length}건`);
console.log(`제약조건: ${data.constraints.length}건`);

console.log('\n=== 샘플 데이터 ===');
console.log('환자 스케줄 첫 번째:', data.patientSchedule[0]);
console.log('제약조건 첫 번째:', data.constraints[0]);
