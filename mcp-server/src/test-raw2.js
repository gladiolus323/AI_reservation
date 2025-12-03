import { loadConstraints } from './data-loader.js';

const constraints = loadConstraints();

// 규칙이 있는 검사 찾기
const withRules = constraints.find(c => c['규칙'] && c['규칙'] !== '[]' && c['규칙'].includes('avoid'));
console.log('규칙이 있는 검사:');
console.log('처방명:', withRules['처방명']);
console.log('규칙 원본:', withRules['규칙']);
console.log('규칙 타입:', typeof withRules['규칙']);
