import { loadConstraints } from './data-loader.js';

const constraints = loadConstraints();

// 태그가 있는 검사 찾기
const withTags = constraints.find(c => c['태그'] && c['태그'].includes('#'));
console.log('태그가 있는 검사:');
console.log('처방명:', withTags['처방명']);
console.log('태그 원본:', withTags['태그']);
console.log('태그 타입:', typeof withTags['태그']);
