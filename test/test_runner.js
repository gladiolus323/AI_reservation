const fs = require('fs');
const path = require('path');

// 설정
const CONFIG = {
  testDataPath: path.join(__dirname, 'test_dataset.json'),
  resultPath: path.join(__dirname, 'test_results.json'),
  agentEndpoint: process.env.AGENT_ENDPOINT || 'http://localhost:3000',
  chatPath: '/api/chat'
};

// 테스트 데이터 로드
function loadTestData() {
  const data = fs.readFileSync(CONFIG.testDataPath, 'utf8');
  return JSON.parse(data);
}

// 확인 질문 패턴 감지
function isConfirmationQuestion(responseText) {
  const confirmPatterns = [
    /맞으신가요/,
    /맞습니까/,
    /확인.*부탁/,
    /맞는지.*확인/,
    /선택.*버튼/,
    /눌러주세요/,
    /클릭.*해주세요/
  ];
  return confirmPatterns.some(pattern => pattern.test(responseText));
}

// 단일 API 호출
async function sendMessage(sessionId, message) {
  const response = await fetch(`${CONFIG.agentEndpoint}${CONFIG.chatPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}

// Agent API 호출 (Multi-turn 지원)
async function callAgent(testCase) {
  // 테스트용 세션 ID 생성
  const sessionId = `test_${testCase.test_id}_${Date.now()}`;

  // 환자 정보와 선호도를 자연어 메시지로 구성
  const message = `환자번호 ${testCase.patient_id}입니다. ${testCase.prescription_name}(${testCase.prescription_code}) 검사 예약하고 싶어요. ${testCase.preference}`;

  const allResponses = [];

  try {
    // 첫 번째 메시지 전송
    let result = await sendMessage(sessionId, message);
    allResponses.push(result.response || '');

    // 확인 질문이면 "네, 맞습니다" 자동 응답 (최대 2회)
    let retryCount = 0;
    while (isConfirmationQuestion(result.response || '') && retryCount < 2) {
      console.log(`  → 확인 질문 감지, 자동 응답 전송...`);
      result = await sendMessage(sessionId, '네, 맞습니다');
      allResponses.push(result.response || '');
      retryCount++;
    }

    // 모든 응답에서 추천 시간대 추출
    const combinedResponse = allResponses.join('\n');
    const recommendedSlots = extractSlotsFromResponse(combinedResponse);

    return {
      raw_response: combinedResponse,
      recommended_slots: recommendedSlots,
      turn_count: allResponses.length
    };
  } catch (error) {
    return { error: error.message, recommended_slots: [], turn_count: 0 };
  }
}

// Agent 응답에서 시간대 추출
function extractSlotsFromResponse(responseText) {
  const slots = [];
  let match;

  // 패턴 1: 2025-08-15 09:00 (연속)
  const pattern1 = /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/g;
  while ((match = pattern1.exec(responseText)) !== null) {
    slots.push(`${match[1]} ${match[2]}`);
  }

  // 패턴 2: 날짜: 2025-08-15 ... 시간: 09:00 (분리된 형식)
  // "날짜: 2026-01-19 (월)" ... "시간: 09:00" 형태
  const datePattern = /날짜:\s*(\d{4}-\d{2}-\d{2})/g;
  const timePattern = /시간:\s*(\d{2}:\d{2})/g;

  const dates = [];
  const times = [];

  while ((match = datePattern.exec(responseText)) !== null) {
    dates.push(match[1]);
  }
  while ((match = timePattern.exec(responseText)) !== null) {
    times.push(match[1]);
  }

  // 날짜와 시간 매칭 (순서대로)
  for (let i = 0; i < Math.min(dates.length, times.length); i++) {
    slots.push(`${dates[i]} ${times[i]}`);
  }

  // 패턴 3: 2025년 8월 15일 9시
  const pattern3 = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일[^\d]*(\d{1,2})[시:]/g;
  while ((match = pattern3.exec(responseText)) !== null) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    const hour = match[4].padStart(2, '0');
    slots.push(`${year}-${month}-${day} ${hour}:00`);
  }

  // 중복 제거
  return [...new Set(slots)];
}

// 시간 문자열 파싱
function parseDateTime(dateTimeStr) {
  return new Date(dateTimeStr.replace(' ', 'T'));
}

// 규칙 준수율 평가
function evaluateRuleCompliance(testCase, agentResponse) {
  const result = {
    valid_slot: false,
    violations: []
  };

  const recommendedSlots = agentResponse.recommended_slots || [];

  if (recommendedSlots.length === 0) {
    result.violations.push('추천 슬롯 없음');
    return result;
  }

  // 첫 번째 추천 슬롯 검증
  const firstSlot = recommendedSlots[0];
  const slotTime = parseDateTime(firstSlot);

  // 금식 시간 검증 (10시 이전)
  if (testCase.violation_types.some(v => v.includes('금식'))) {
    if (slotTime.getHours() >= 10) {
      result.violations.push('금식 시간 위반 (10시 이후 추천)');
    }
  }

  // gap_days 위반 검증은 Agent가 올바른 날짜를 추천했는지 확인
  // (실제로는 환자의 기존 예약과 비교해야 함)

  result.valid_slot = result.violations.length === 0;
  return result;
}

// Hit Rate @ K 평가
function evaluateHitRate(testCase, agentResponse, k = 3) {
  const recommendedSlots = agentResponse.recommended_slots || [];
  const expectedSlots = testCase.expected_slots || [];

  // 추천된 상위 K개 슬롯 중 정답이 있는지 확인
  const topK = recommendedSlots.slice(0, k);

  for (const expected of expectedSlots) {
    const expectedDate = expected.split(' ')[0];
    const expectedHour = parseInt(expected.split(' ')[1].split(':')[0]);

    for (const recommended of topK) {
      const recDate = recommended.split(' ')[0] || recommended.split('T')[0];
      const recHour = parseInt((recommended.split(' ')[1] || recommended.split('T')[1]).split(':')[0]);

      // 같은 날짜 + 1시간 이내면 히트로 간주
      if (expectedDate === recDate && Math.abs(expectedHour - recHour) <= 1) {
        return true;
      }
    }
  }

  return false;
}

// 단일 테스트 실행
async function runSingleTest(testCase) {
  console.log(`\n[${testCase.test_id}] ${testCase.prescription_name} 테스트 중...`);

  const startTime = Date.now();
  const agentResponse = await callAgent(testCase);
  const duration = Date.now() - startTime;

  const ruleCompliance = evaluateRuleCompliance(testCase, agentResponse);
  const hitAtK = evaluateHitRate(testCase, agentResponse, 3);

  return {
    test_id: testCase.test_id,
    patient_id: testCase.patient_id,
    prescription_code: testCase.prescription_code,
    test_purpose: testCase.test_purpose,
    duration_ms: duration,
    agent_response: agentResponse,
    evaluation: {
      rule_compliance: ruleCompliance,
      hit_at_3: hitAtK
    }
  };
}

// 전체 테스트 실행
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('AI 예약 Agent 테스트 시작');
  console.log('='.repeat(60));

  const testCases = loadTestData();
  const results = [];

  for (const testCase of testCases) {
    const result = await runSingleTest(testCase);
    results.push(result);
  }

  // 결과 요약
  const summary = calculateSummary(results);

  // 결과 저장
  const finalResult = {
    timestamp: new Date().toISOString(),
    total_tests: results.length,
    summary,
    details: results
  };

  fs.writeFileSync(CONFIG.resultPath, JSON.stringify(finalResult, null, 2), 'utf8');

  // 결과 출력
  printSummary(summary, results.length);

  return finalResult;
}

// 결과 요약 계산
function calculateSummary(results) {
  const total = results.length;

  let validSlots = 0;
  let totalViolations = 0;
  let hitAt3 = 0;

  const violationsByType = {};

  for (const result of results) {
    if (result.evaluation.rule_compliance.valid_slot) {
      validSlots++;
    }

    const violations = result.evaluation.rule_compliance.violations;
    totalViolations += violations.length;

    for (const v of violations) {
      violationsByType[v] = (violationsByType[v] || 0) + 1;
    }

    if (result.evaluation.hit_at_3) {
      hitAt3++;
    }
  }

  return {
    rule_compliance: {
      valid_slot_rate: ((validSlots / total) * 100).toFixed(1) + '%',
      valid_slots: validSlots,
      total_violations: totalViolations,
      violations_by_type: violationsByType
    },
    recommendation_accuracy: {
      hit_rate_at_3: ((hitAt3 / total) * 100).toFixed(1) + '%',
      hits: hitAt3
    }
  };
}

// 결과 출력
function printSummary(summary, total) {
  console.log('\n' + '='.repeat(60));
  console.log('테스트 결과 요약');
  console.log('='.repeat(60));

  console.log('\n[규칙 준수율 (MCP 평가)]');
  console.log(`  유효 슬롯 제안율: ${summary.rule_compliance.valid_slot_rate} (${summary.rule_compliance.valid_slots}/${total})`);
  console.log(`  총 제약 위반 횟수: ${summary.rule_compliance.total_violations}건`);

  if (Object.keys(summary.rule_compliance.violations_by_type).length > 0) {
    console.log('  위반 유형별:');
    for (const [type, count] of Object.entries(summary.rule_compliance.violations_by_type)) {
      console.log(`    - ${type}: ${count}건`);
    }
  }

  console.log('\n[추천 적합도 (AI 평가)]');
  console.log(`  Hit Rate @ 3: ${summary.recommendation_accuracy.hit_rate_at_3} (${summary.recommendation_accuracy.hits}/${total})`);

  console.log('\n' + '='.repeat(60));
  console.log(`결과 저장: ${CONFIG.resultPath}`);
  console.log('='.repeat(60));
}

// Mock 모드 (Agent 없이 테스트)
async function runMockTests() {
  console.log('='.repeat(60));
  console.log('AI 예약 Agent 테스트 (Mock 모드)');
  console.log('='.repeat(60));

  const testCases = loadTestData();

  console.log(`\n총 ${testCases.length}개 테스트 케이스 로드됨\n`);

  console.log('테스트 케이스 목록:');
  console.log('-'.repeat(60));

  for (const tc of testCases) {
    console.log(`[${tc.test_id}] ${tc.prescription_name}`);
    console.log(`  환자: ${tc.patient_id}`);
    console.log(`  목적: ${tc.test_purpose}`);
    console.log(`  예상 정답: ${tc.expected_slots[0]}`);
    if (tc.violation_types.length > 0) {
      console.log(`  위반 유형: ${tc.violation_types.join(', ')}`);
    }
    console.log('');
  }

  console.log('-'.repeat(60));
  console.log('\nAgent 연결 후 실제 테스트를 실행하려면:');
  console.log('  AGENT_ENDPOINT=http://your-agent-url node test_runner.js');
}

// 메인 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--mock') || !process.env.AGENT_ENDPOINT) {
    await runMockTests();
  } else {
    await runAllTests();
  }
}

main().catch(console.error);
