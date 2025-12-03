import { loadResourceSchedule, loadPatientSchedule, loadConstraints } from '../data-loader.js';

/**
 * 규칙 문자열 파싱
 * CSV 형식: [{avoid_tags:[#Nuclear],gap_days:1,reason:방사성 동위원소 간섭 방지}]
 * JSON이 아니므로 수동 파싱 필요
 */
function parseRules(ruleStr) {
    if (!ruleStr || ruleStr === '[]') return [];

    const rules = [];
    // [{...},{...}] 형식에서 각 {...}를 추출
    const ruleMatches = ruleStr.match(/\{[^}]+\}/g);
    if (!ruleMatches) return [];

    for (const ruleMatch of ruleMatches) {
        const rule = {};

        // avoid_tags:[#tag1,#tag2] 추출
        const avoidTagsMatch = ruleMatch.match(/avoid_tags:\[([^\]]*)\]/);
        if (avoidTagsMatch) {
            rule.avoid_tags = avoidTagsMatch[1].split(',').map(t => t.trim()).filter(t => t);
        }

        // gap_days:숫자 추출
        const gapMatch = ruleMatch.match(/gap_days:(\d+)/);
        if (gapMatch) {
            rule.gap_days = parseInt(gapMatch[1]);
        }

        // reason:텍스트 추출
        const reasonMatch = ruleMatch.match(/reason:([^,}]+)/);
        if (reasonMatch) {
            rule.reason = reasonMatch[1].trim();
        }

        if (rule.avoid_tags && rule.gap_days !== undefined) {
            rules.push(rule);
        }
    }

    return rules;
}

/**
 * 예약 불가능한 시간대 조회
 *
 * 불가능한 시간대:
 * 1. 이미 예약된 시간 (시작~종료 시간 전체)
 * 2. 환자의 기존 예약과 충돌하는 시간 (시간 겹침 + 검사 간격 규칙)
 * 3. 운영시간 외 (09:00~17:00 외, 주말)
 */
export function getUnavailableSlots(equipmentType, startDate, endDate, patientId, examCode) {
    const resourceSchedule = loadResourceSchedule();
    const patientSchedule = loadPatientSchedule();
    const constraints = loadConstraints();

    // 1. 해당 장비유형의 리소스 목록 추출
    const resourceMap = new Map();
    resourceSchedule
        .filter(r => r['장비유형'] === equipmentType)
        .forEach(r => {
            if (!resourceMap.has(r['리소스ID'])) {
                resourceMap.set(r['리소스ID'], r['리소스명']);
            }
        });
    const resources = Array.from(resourceMap.entries()).map(([id, name]) => ({ id, name }));

    if (resources.length === 0) {
        // constraints에서 장비유형 확인
        const validEquipment = constraints.find(c => c['장비유형'] === equipmentType);
        if (!validEquipment) {
            return {
                success: false,
                error: `장비유형 '${equipmentType}'을(를) 찾을 수 없습니다.`
            };
        }
    }

    // 2. 검사 제약조건 조회 (새로 예약하려는 검사) - 처방코드로 조회
    const searchCode = examCode ? examCode.trim().toUpperCase() : '';
    const examConstraint = constraints.find(c => c['처방코드'].toUpperCase() === searchCode);
    const examName = examConstraint ? examConstraint['처방명'] : examCode; // 표시용 검사명
    let examTags = [];
    let examRules = [];
    if (examConstraint) {
        try {
            const tagStr = examConstraint['태그'];
            if (tagStr && tagStr !== '[]') {
                examTags = tagStr.slice(1, -1).split(',').map(t => t.trim()).filter(t => t);
            }
            const ruleStr = examConstraint['규칙'];
            examRules = parseRules(ruleStr);
        } catch (e) {}
    }

    // 3. 기간 설정
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59);

    // 4. 해당 기간의 장비 예약 현황 (이미 예약된 시간)
    const resourceBookings = resourceSchedule.filter(r => {
        if (r['장비유형'] !== equipmentType) return false;
        const bookingDate = new Date(r['실제시작시간']);
        return bookingDate >= start && bookingDate <= end;
    });

    // 5. 환자의 기존 예약 조회
    const patientReservations = patientSchedule.filter(p => p['환자번호'] === patientId);

    // 6. 날짜별 불가능한 시간대 계산
    const unavailableByDate = {};
    const currentDate = new Date(start);

    while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay();

        // 주말은 전체 불가
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            unavailableByDate[dateStr] = {
                date: dateStr,
                dayOfWeek: getDayName(dayOfWeek),
                isWeekend: true,
                reason: '주말 휴무'
            };
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
        }

        // 해당 날짜의 리소스별 예약 현황
        const dayBookings = resourceBookings.filter(r =>
            r['실제시작시간'].startsWith(dateStr)
        );

        // 리소스별 예약 시간 정리
        const resourceUnavailable = {};
        for (const resource of resources) {
            const bookings = dayBookings
                .filter(r => r['리소스ID'] === resource.id)
                .map(r => ({
                    start: r['실제시작시간'].split(' ')[1],
                    end: r['종료시간'].split(' ')[1],
                    reason: '예약됨'
                }))
                .sort((a, b) => a.start.localeCompare(b.start));

            if (bookings.length > 0) {
                resourceUnavailable[resource.name] = bookings;
            }
        }

        // 환자의 해당 날짜 기존 예약 (시간 충돌)
        const patientDayReservations = patientReservations.filter(p =>
            p['예약일시'] && p['예약일시'].startsWith(dateStr)
        );

        const patientTimeConflicts = patientDayReservations.map(p => {
            const startTime = p['예약일시'].split(' ')[1];
            // 종료시간은 resource_schedule에서 조회
            const resourceEntry = resourceSchedule.find(r => r['처방ID'] === p['처방ID']);
            const endTime = resourceEntry ? resourceEntry['종료시간'].split(' ')[1] : startTime;

            return {
                start: startTime,
                end: endTime,
                exam: p['처방명'],
                reason: `환자 기존 예약: ${p['처방명']}`
            };
        });

        // 검사 간격 규칙 위반 날짜 확인
        const gapViolations = [];
        for (const reservation of patientReservations) {
            if (!reservation['예약일시']) continue;

            const reservationDateStr = reservation['예약일시'].split(' ')[0];
            const reservationDate = new Date(reservationDateStr);
            const checkDate = new Date(dateStr);
            const daysDiff = Math.abs((checkDate - reservationDate) / (1000 * 60 * 60 * 24));

            // 기존 검사의 태그 조회
            const existingConstraint = constraints.find(c => c['처방명'] === reservation['처방명']);
            if (!existingConstraint) continue;

            let existingTags = [];
            try {
                const tagStr = existingConstraint['태그'];
                if (tagStr && tagStr !== '[]') {
                    existingTags = tagStr.slice(1, -1).split(',').map(t => t.trim()).filter(t => t);
                }
            } catch (e) {}

            // 새 검사의 규칙 확인 (avoid_tags에 기존 검사 태그가 있는지)
            for (const rule of examRules) {
                const matchingTags = rule.avoid_tags?.filter(tag => existingTags.includes(tag)) || [];
                if (matchingTags.length > 0 && daysDiff <= rule.gap_days) {
                    gapViolations.push({
                        allDay: true,
                        relatedExam: reservation['처방명'],
                        relatedDate: reservationDateStr,
                        requiredGap: rule.gap_days + 1,
                        reason: `${reservation['처방명']}(${reservationDateStr})과 최소 ${rule.gap_days + 1}일 간격 필요 (${rule.reason})`
                    });
                }
            }

            // 기존 검사의 규칙도 확인 (기존 검사가 새 검사를 피해야 하는 경우)
            let existingRules = [];
            try {
                const ruleStr = existingConstraint['규칙'];
                existingRules = parseRules(ruleStr);
            } catch (e) {}

            for (const rule of existingRules) {
                const matchingTags = rule.avoid_tags?.filter(tag => examTags.includes(tag)) || [];
                if (matchingTags.length > 0 && daysDiff <= rule.gap_days) {
                    // 중복 방지
                    const isDuplicate = gapViolations.some(v =>
                        v.relatedExam === reservation['처방명'] && v.relatedDate === reservationDateStr
                    );
                    if (!isDuplicate) {
                        gapViolations.push({
                            allDay: true,
                            relatedExam: reservation['처방명'],
                            relatedDate: reservationDateStr,
                            requiredGap: rule.gap_days + 1,
                            reason: `${reservation['처방명']}(${reservationDateStr})과 최소 ${rule.gap_days + 1}일 간격 필요 (${rule.reason})`
                        });
                    }
                }
            }
        }

        unavailableByDate[dateStr] = {
            date: dateStr,
            dayOfWeek: getDayName(dayOfWeek),
            isWeekend: false,
            resourceBookings: resourceUnavailable,
            patientTimeConflicts: patientTimeConflicts.length > 0 ? patientTimeConflicts : undefined,
            gapViolations: gapViolations.length > 0 ? gapViolations : undefined
        };

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
        success: true,
        data: {
            equipmentType,
            resources: resources.map(r => r.name),
            operatingHours: { start: '09:00', end: '17:00' },
            searchPeriod: { startDate, endDate },
            patientId,
            examCode,
            examName,
            unavailableSlots: Object.values(unavailableByDate)
        }
    };
}

function getDayName(dayOfWeek) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[dayOfWeek];
}

// 도구 정의 (MCP용)
export const getUnavailableSlotsTool = {
    name: 'get_unavailable_slots',
    description: '특정 장비유형에 대해 예약 불가능한 시간대를 조회합니다. 이미 예약된 시간, 환자의 기존 예약과 충돌하는 시간, 검사 간격 규칙 위반 날짜를 반환합니다. AI는 운영시간(09:00~17:00)에서 이 불가능한 시간을 제외하고 추천해야 합니다.',
    inputSchema: {
        type: 'object',
        properties: {
            equipment_type: {
                type: 'string',
                description: '장비유형 (예: MRI, CT, 초음파(US), 내시경실)'
            },
            start_date: {
                type: 'string',
                description: '검색 시작일 (YYYY-MM-DD 형식)'
            },
            end_date: {
                type: 'string',
                description: '검색 종료일 (YYYY-MM-DD 형식)'
            },
            patient_id: {
                type: 'string',
                description: '환자번호 - 환자의 기존 예약과 충돌 확인용'
            },
            exam_code: {
                type: 'string',
                description: '예약하려는 처방코드 - 검사 간격 규칙 확인용'
            }
        },
        required: ['equipment_type', 'start_date', 'end_date', 'patient_id', 'exam_code']
    }
};
