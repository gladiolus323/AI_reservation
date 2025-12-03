/**
 * MCP 서버 테스트 클라이언트
 * 실제 MCP 프로토콜을 사용하여 서버와 통신
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

class MCPTestClient {
    constructor() {
        this.requestId = 0;
        this.pendingRequests = new Map();
    }

    async start() {
        // MCP 서버 프로세스 시작
        this.server = spawn('node', ['src/index.js'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
        });

        // stdout에서 응답 읽기
        let buffer = '';
        this.server.stdout.on('data', (data) => {
            buffer += data.toString();

            // JSON 메시지 파싱 시도
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 마지막 불완전한 라인 보관

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const response = JSON.parse(line);
                        const resolver = this.pendingRequests.get(response.id);
                        if (resolver) {
                            resolver(response);
                            this.pendingRequests.delete(response.id);
                        }
                    } catch (e) {
                        // JSON이 아닌 출력 무시
                    }
                }
            }
        });

        this.server.stderr.on('data', (data) => {
            console.error('[서버 로그]', data.toString().trim());
        });

        // 초기화
        await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });

        console.log('✅ MCP 서버 연결 완료\n');
    }

    sendRequest(method, params) {
        return new Promise((resolve) => {
            const id = ++this.requestId;
            const request = {
                jsonrpc: '2.0',
                id,
                method,
                params
            };

            this.pendingRequests.set(id, resolve);
            this.server.stdin.write(JSON.stringify(request) + '\n');

            // 타임아웃 설정
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    resolve({ error: 'Timeout' });
                }
            }, 5000);
        });
    }

    async listTools() {
        const response = await this.sendRequest('tools/list', {});
        return response.result?.tools || [];
    }

    async callTool(name, args) {
        const response = await this.sendRequest('tools/call', { name, arguments: args });
        if (response.result?.content?.[0]?.text) {
            return JSON.parse(response.result.content[0].text);
        }
        return response;
    }

    stop() {
        this.server.kill();
    }
}

// 대화형 테스트 실행
async function interactiveTest() {
    const client = new MCPTestClient();

    console.log('========================================');
    console.log('  MCP 서버 대화형 테스트 클라이언트');
    console.log('========================================\n');

    try {
        await client.start();

        // 도구 목록 표시
        const tools = await client.listTools();
        console.log('📋 사용 가능한 도구:');
        tools.forEach((tool, i) => {
            console.log(`  ${i + 1}. ${tool.name}`);
            console.log(`     설명: ${tool.description}`);
        });

        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

        while (true) {
            console.log('\n----------------------------------------');
            console.log('테스트할 도구 선택:');
            console.log('  1. get_patient_info - 환자 정보 조회');
            console.log('  2. get_exam_constraints - 검사 제약조건 조회');
            console.log('  3. search_exam_name - 검사명 검색');
            console.log('  4. get_available_slots - 가용 슬롯 조회');
            console.log('  5. check_conflicts - 충돌 확인');
            console.log('  0. 종료');

            const choice = await question('\n선택 (0-5): ');

            if (choice === '0') {
                console.log('\n테스트 종료');
                break;
            }

            let result;
            try {
                switch (choice) {
                    case '1': {
                        const patientId = await question('환자번호 입력 (예: 00003795): ');
                        console.log('\n🔍 조회 중...');
                        result = await client.callTool('get_patient_info', { patient_id: patientId });
                        break;
                    }
                    case '2': {
                        const examName = await question('검사명 입력 (예: (3T)MRI-BRAIN): ');
                        console.log('\n🔍 조회 중...');
                        result = await client.callTool('get_exam_constraints', { exam_name: examName });
                        break;
                    }
                    case '3': {
                        const keyword = await question('검색 키워드 입력 (예: CT, MRI, 초음파): ');
                        console.log('\n🔍 검색 중...');
                        result = await client.callTool('search_exam_name', { keyword });
                        break;
                    }
                    case '4': {
                        const equipmentType = await question('장비유형 입력 (예: MRI, CT): ');
                        const startDate = await question('시작일 (YYYY-MM-DD): ');
                        const endDate = await question('종료일 (YYYY-MM-DD): ');
                        console.log('\n🔍 조회 중...');
                        result = await client.callTool('get_available_slots', {
                            equipment_type: equipmentType,
                            start_date: startDate,
                            end_date: endDate
                        });
                        break;
                    }
                    case '5': {
                        const patientId = await question('환자번호 입력: ');
                        const examName = await question('검사명 입력: ');
                        const proposedDate = await question('희망일 (YYYY-MM-DD): ');
                        const proposedTime = await question('희망시간 (HH:MM): ');
                        console.log('\n🔍 확인 중...');
                        result = await client.callTool('check_conflicts', {
                            patient_id: patientId,
                            exam_name: examName,
                            proposed_date: proposedDate,
                            proposed_time: proposedTime
                        });
                        break;
                    }
                    default:
                        console.log('잘못된 선택입니다.');
                        continue;
                }

                console.log('\n📄 결과:');
                console.log(JSON.stringify(result, null, 2));
            } catch (error) {
                console.error('오류:', error.message);
            }
        }

        rl.close();
        client.stop();
    } catch (error) {
        console.error('서버 시작 실패:', error);
        client.stop();
    }
}

// 자동 테스트 모드
async function autoTest() {
    const client = new MCPTestClient();

    console.log('========================================');
    console.log('  MCP 서버 자동 테스트');
    console.log('========================================\n');

    try {
        await client.start();

        // 테스트 케이스 실행
        const tests = [
            {
                name: '환자 정보 조회',
                tool: 'get_patient_info',
                args: { patient_id: '00003795' },
                validate: (r) => r.success && r.data?.환자번호 === '00003795'
            },
            {
                name: '검사 제약조건 조회',
                tool: 'get_exam_constraints',
                args: { exam_name: '(3T)MRI-BRAIN' },
                validate: (r) => r.success && r.data?.장비유형 === 'MRI'
            },
            {
                name: '검사명 검색',
                tool: 'search_exam_name',
                args: { keyword: 'CT' },
                validate: (r) => r.success && r.data?.length > 0
            },
            {
                name: '가용 슬롯 조회',
                tool: 'get_available_slots',
                args: { equipment_type: 'MRI', start_date: '2026-01-12', end_date: '2026-01-14' },
                validate: (r) => r.success && r.data?.totalAvailableDays > 0
            },
            {
                name: '충돌 확인 (충돌 있음)',
                tool: 'check_conflicts',
                args: { patient_id: '00003795', exam_name: '(3T)MRI-BRAIN', proposed_date: '2026-03-18', proposed_time: '10:35' },
                validate: (r) => r.success && r.hasConflict === true
            },
            {
                name: '충돌 확인 (충돌 없음)',
                tool: 'check_conflicts',
                args: { patient_id: '00003795', exam_name: '(3T)MRI-BRAIN', proposed_date: '2026-03-25', proposed_time: '10:00' },
                validate: (r) => r.success && r.hasConflict === false
            }
        ];

        let passed = 0;
        let failed = 0;

        for (const test of tests) {
            process.stdout.write(`테스트: ${test.name}... `);
            try {
                const result = await client.callTool(test.tool, test.args);
                if (test.validate(result)) {
                    console.log('✅ 통과');
                    passed++;
                } else {
                    console.log('❌ 실패');
                    console.log('  결과:', JSON.stringify(result, null, 2).slice(0, 200));
                    failed++;
                }
            } catch (error) {
                console.log('❌ 오류:', error.message);
                failed++;
            }
        }

        console.log('\n========================================');
        console.log(`결과: ${passed}개 통과, ${failed}개 실패`);
        console.log('========================================');

        client.stop();
        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('테스트 실패:', error);
        client.stop();
        process.exit(1);
    }
}

// 명령줄 인자에 따라 모드 선택
const mode = process.argv[2];
if (mode === '--auto') {
    autoTest();
} else {
    interactiveTest();
}
