import { getExamConstraints } from './tools/get-exam-constraints.js';

console.log('=== 검사 제약조건 조회 테스트 ===\n');

// 태그와 규칙이 있는 검사
const result1 = getExamConstraints('PET TORSO');
console.log('PET TORSO:');
console.log(JSON.stringify(result1, null, 2));

console.log('\n---\n');

// MRI 검사
const result2 = getExamConstraints('(3T)MRI-BRAIN');
console.log('(3T)MRI-BRAIN:');
console.log(JSON.stringify(result2, null, 2));

console.log('\n---\n');

// 존재하지 않는 검사
const result3 = getExamConstraints('없는검사');
console.log('없는검사:');
console.log(JSON.stringify(result3, null, 2));
