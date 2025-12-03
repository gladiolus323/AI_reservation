/**
 * 빠른 테스트 - 명령줄 인자로 바로 테스트
 *
 * 사용법:
 *   node quick-test.js patient 00003795
 *   node quick-test.js exam "(3T)MRI-BRAIN"
 *   node quick-test.js search "CT"
 *   node quick-test.js slots MRI 2026-01-12 2026-01-14
 *   node quick-test.js conflict 00003795 "(3T)MRI-BRAIN" 2026-03-18 10:35
 */

import { getPatientInfo } from './src/tools/get-patient-info.js';
import { getExamConstraints } from './src/tools/get-exam-constraints.js';
import { searchExamName } from './src/tools/search-exam-name.js';
import { getAvailableSlots } from './src/tools/get-available-slots.js';
import { checkConflicts } from './src/tools/check-conflicts.js';

const [,, command, ...args] = process.argv;

function printResult(result) {
    console.log(JSON.stringify(result, null, 2));
}

function printHelp() {
    console.log(`
MCP 서버 빠른 테스트

사용법:
  node quick-test.js <command> [args...]

명령어:
  patient <환자번호>
    예: node quick-test.js patient 00003795

  exam <검사명>
    예: node quick-test.js exam "(3T)MRI-BRAIN"

  search <키워드>
    예: node quick-test.js search CT
    예: node quick-test.js search 초음파

  slots <장비유형> <시작일> <종료일> [소요시간]
    예: node quick-test.js slots MRI 2026-01-12 2026-01-14
    예: node quick-test.js slots CT 2026-01-12 2026-01-14 20

  conflict <환자번호> <검사명> <희망일> <희망시간>
    예: node quick-test.js conflict 00003795 "(3T)MRI-BRAIN" 2026-03-18 10:35
`);
}

switch (command) {
    case 'patient':
        if (!args[0]) {
            console.log('환자번호를 입력하세요');
            console.log('예: node quick-test.js patient 00003795');
        } else {
            console.log(`\n🔍 환자 정보 조회: ${args[0]}\n`);
            printResult(getPatientInfo(args[0]));
        }
        break;

    case 'exam':
        if (!args[0]) {
            console.log('검사명을 입력하세요');
            console.log('예: node quick-test.js exam "(3T)MRI-BRAIN"');
        } else {
            console.log(`\n🔍 검사 제약조건 조회: ${args[0]}\n`);
            printResult(getExamConstraints(args[0]));
        }
        break;

    case 'search':
        if (!args[0]) {
            console.log('검색 키워드를 입력하세요');
            console.log('예: node quick-test.js search CT');
        } else {
            console.log(`\n🔍 검사명 검색: ${args[0]}\n`);
            printResult(searchExamName(args[0]));
        }
        break;

    case 'slots':
        if (args.length < 3) {
            console.log('장비유형, 시작일, 종료일을 입력하세요');
            console.log('예: node quick-test.js slots MRI 2026-01-12 2026-01-14');
        } else {
            const [equipment, startDate, endDate, duration] = args;
            console.log(`\n🔍 가용 슬롯 조회: ${equipment} (${startDate} ~ ${endDate})\n`);
            printResult(getAvailableSlots(equipment, startDate, endDate, parseInt(duration) || 30));
        }
        break;

    case 'conflict':
        if (args.length < 4) {
            console.log('환자번호, 검사명, 희망일, 희망시간을 입력하세요');
            console.log('예: node quick-test.js conflict 00003795 "(3T)MRI-BRAIN" 2026-03-18 10:35');
        } else {
            const [patientId, examName, date, time] = args;
            console.log(`\n🔍 충돌 확인: 환자 ${patientId}, ${examName}, ${date} ${time}\n`);
            printResult(checkConflicts(patientId, examName, date, time));
        }
        break;

    default:
        printHelp();
}
