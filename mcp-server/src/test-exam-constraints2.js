import { getExamConstraints } from './tools/get-exam-constraints.js';

console.log('=== 규칙이 있는 검사 테스트 ===\n');

// 핵의학 검사 (규칙 있음)
const result1 = getExamConstraints('Thyroid uptake scan 99mTc');
console.log('Thyroid uptake scan 99mTc:');
console.log(JSON.stringify(result1, null, 2));

console.log('\n---\n');

// 바륨 검사 (규칙 있음)
const result2 = getExamConstraints('Swallowing Difficulty Evaluati');
console.log('Swallowing Difficulty Evaluati:');
console.log(JSON.stringify(result2, null, 2));
