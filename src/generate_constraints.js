const fs = require('fs');
const path = require('path');

// ============================================
// patient_schedule.csv에서 처방 목록 추출
// ============================================
const patientPath = path.join(__dirname, '../data/patient_schedule.csv');
let csvData = fs.readFileSync(patientPath, 'utf8');
if (csvData.charCodeAt(0) === 0xFEFF) csvData = csvData.slice(1);

const lines = csvData.split('\n');
const prescriptions = new Map(); // 처방코드 -> {처방명, 처방분류, count}

for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const row = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    row.push(current.trim());

    const 처방코드 = row[3];
    const 처방명 = row[4];
    const 처방분류 = row[2];

    if (!prescriptions.has(처방코드)) {
        prescriptions.set(처방코드, { 처방명, 처방분류, count: 0 });
    }
    prescriptions.get(처방코드).count++;
}

console.log(`patient_schedule에서 ${prescriptions.size}개 처방코드 추출\n`);

// ============================================
// 장비유형 매핑 (resource_schedule과 동일한 로직)
// ============================================
function getEquipmentType(code, name, category) {
    if (code.startsWith('RC') || code.startsWith('HA')) return 'CT';
    if (code.startsWith('RM')) return 'MRI';
    if (code.startsWith('RU')) return '초음파(US)';
    if (code.startsWith('RF')) return '투시촬영';
    if (code.startsWith('NM01')) return 'SPECT/Gamma Camera';
    if (code.startsWith('NM02')) return 'PET-CT';

    if (category === '이비인후과') {
        if (['SC140005', 'SC140006', 'SC140007', 'SC140008', 'SC140009', 'SC140010', 'SC140011'].includes(code)) return '청력검사실';
        if (['SC140014', 'SC140015', 'SC140016', 'SC140017'].includes(code)) return '폐기능검사실';
        if (['SC140020', 'SC140021', 'SC140022', 'SC140026', 'SC140027', 'SC140028'].includes(code)) return '전정기능검사실';
        return '이비인후과기타';
    }

    if (category === '신경과') {
        if (name.includes('EMG') || name.includes('NCV') || name.includes('신경전도') || name.includes('F파') || name.includes('H 반사') || name.includes('Blink') || name.includes('Nerve')) return 'EMG/NCV검사실';
        if (name.includes('EEG') || name.includes('각성')) return '뇌파검사실(EEG)';
        if (name.includes('치매') || name.includes('인지') || name.includes('MMSE') || name.includes('CERAD') || name.includes('CDR') || name.includes('GDS') || name.includes('우울') || name.includes('ADL') || name.includes('SNSB') || name.includes('NPI') || name.includes('LICA') || name.includes('UPDRS') || name.includes('CRTS')) return '신경심리검사실';
        if (name.includes('VNG') || name.includes('어지럼') || name.includes('Caloric')) return '전정기능검사실';
        if (name.includes('자율신경') || name.includes('기립경사')) return '자율신경검사실';
        return '신경과기타';
    }

    if (category === '심장혈관내과') {
        if (name.includes('심초음파') || name.includes('심장초음파') || name.includes('IMT') || name.includes('Carotid')) return '심초음파실';
        if (name.includes('Holter') || name.includes('심전도감시') || name.includes('혈압측정')) return '홀터/ABPM';
        if (name.includes('Treadmill')) return '운동부하검사실';
        return '심장혈관내과기타';
    }

    if (category === '소화기센터') return '내시경실';
    if (category === '검진센터') {
        if (name.includes('동맥경화')) return '동맥경화도검사실';
        return '검진센터기타';
    }
    if (category === '방사선종양학과(CT)') return 'CT';

    return '기타';
}

// ============================================
// 태그 생성 로직
// ============================================
function generateTags(code, name, category, equipType) {
    const tags = [];

    // 장비 유형 태그
    if (equipType === 'CT') tags.push('#CT');
    if (equipType === 'MRI') tags.push('#MRI');
    if (equipType === 'PET-CT') tags.push('#PET');
    if (equipType === 'SPECT/Gamma Camera') tags.push('#SPECT');
    if (equipType === '초음파(US)') tags.push('#US');
    if (equipType === '내시경실') tags.push('#Endoscopy');

    // 핵의학 태그
    if (code.startsWith('NM')) tags.push('#Nuclear');

    // 조영제 태그 - 처방명에 CE, Contrast, 조영 등이 포함된 경우
    // 단, 같은 날 여러 조영제 검사가 가능하므로 규칙은 설정하지 않음
    if (name.includes('(CE)') || name.includes('CE)') || name.includes('CONTRAST') || name.includes('Contrast')) {
        tags.push('#Contrast');
    }

    // 진정/수면 태그
    if (name.includes('수면') || name.includes('진정') || name.includes('포폴')) {
        tags.push('#Sedation');
    }

    // 바륨 태그
    if (name.includes('Barium') || name.includes('바륨') || name.includes('Swallowing')) {
        tags.push('#Barium');
    }

    // 부위 태그
    if (name.includes('Brain') || name.includes('뇌') || name.includes('Head')) tags.push('#Brain');
    if (name.includes('Abdomen') || name.includes('복부') || name.includes('간') || name.includes('Liver')) tags.push('#Abdomen');
    if (name.includes('Chest') || name.includes('흉부') || name.includes('Lung')) tags.push('#Chest');
    if (name.includes('Spine') || name.includes('척추')) tags.push('#Spine');
    if (name.includes('Cardiac') || name.includes('Heart') || name.includes('심장')) tags.push('#Cardiac');

    // 금식 필요 검사
    if (equipType === '내시경실' || name.includes('PET') ||
        (tags.includes('#Abdomen') && (tags.includes('#CT') || tags.includes('#MRI') || tags.includes('#US')))) {
        tags.push('#Fasting');
    }

    return tags;
}

// ============================================
// 소요시간 추정 (장비유형 기반)
// ============================================
function estimateDuration(equipType, name) {
    const durations = {
        'CT': 20,
        'MRI': 45,
        'PET-CT': 60,
        'SPECT/Gamma Camera': 30,
        '초음파(US)': 20,
        '투시촬영': 15,
        '내시경실': 30,
        '심초음파실': 30,
        '홀터/ABPM': 15,
        '운동부하검사실': 30,
        '동맥경화도검사실': 15,
        '청력검사실': 30,
        '폐기능검사실': 20,
        '전정기능검사실': 30,
        'EMG/NCV검사실': 45,
        '뇌파검사실(EEG)': 30,
        '신경심리검사실': 60,
        '자율신경검사실': 30
    };

    return durations[equipType] || 30;
}

// ============================================
// 규칙 생성 - 실제 예약 패턴을 반영
// ============================================
function generateRules(tags, code, name) {
    const rules = [];

    // 핵의학 검사 후 다른 핵의학 검사 - 1일 간격
    // (방사성 동위원소 간섭)
    if (tags.includes('#Nuclear')) {
        rules.push({
            avoid_tags: ['#Nuclear'],
            gap_days: 1,
            reason: '방사성 동위원소 간섭 방지'
        });
    }

    // 바륨 검사 후 복부 영상 검사 - 3일 간격
    // (바륨 잔류로 인한 영상 품질 저하)
    if (tags.includes('#Barium')) {
        rules.push({
            avoid_tags: ['#Abdomen'],
            gap_days: 3,
            reason: '바륨 잔류로 인한 영상 품질 저하'
        });
    }

    // 진정 검사 후 운동부하검사 - 1일 간격
    // (진정 후 협조 곤란)
    if (tags.includes('#Sedation')) {
        rules.push({
            avoid_tags: ['#Treadmill'],
            gap_days: 1,
            reason: '진정 후 협조 곤란'
        });
    }

    // 참고: 조영제(#Contrast) 규칙은 제외
    // 실제 병원에서 같은 날 여러 조영제 검사를 진행하는 경우가 많음

    return rules;
}

// ============================================
// constraints.csv 생성
// ============================================
const rows = [];
rows.push('처방코드,처방명,장비유형,소요시간,태그,규칙');

const stats = {
    total: 0,
    withTags: 0,
    withRules: 0,
    byEquipType: {}
};

// 처방코드 순으로 정렬
const sortedCodes = [...prescriptions.keys()].sort();

sortedCodes.forEach(code => {
    const { 처방명, 처방분류, count } = prescriptions.get(code);

    const equipType = getEquipmentType(code, 처방명, 처방분류);
    const tags = generateTags(code, 처방명, 처방분류, equipType);
    const duration = estimateDuration(equipType, 처방명);
    const rules = generateRules(tags, code, 처방명);

    // 통계
    stats.total++;
    if (tags.length > 0) stats.withTags++;
    if (rules.length > 0) stats.withRules++;
    stats.byEquipType[equipType] = (stats.byEquipType[equipType] || 0) + 1;

    // CSV 행 생성
    const tagsJson = JSON.stringify(tags);
    const rulesJson = JSON.stringify(rules);

    // CSV 이스케이프 처리
    const escapeCsv = (str) => {
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    rows.push([
        code,
        escapeCsv(처방명),
        equipType,
        duration,
        escapeCsv(tagsJson),
        escapeCsv(rulesJson)
    ].join(','));
});

// 파일 저장
const outputPath = path.join(__dirname, '../data/constraints.csv');
fs.writeFileSync(outputPath, rows.join('\n'), 'utf8');

// 결과 출력
console.log('=== constraints.csv 생성 완료 ===\n');
console.log(`총 처방 수: ${stats.total}개`);
console.log(`태그 있는 처방: ${stats.withTags}개`);
console.log(`규칙 있는 처방: ${stats.withRules}개`);
console.log('\n장비유형별 분포:');
Object.entries(stats.byEquipType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}개`);
    });

console.log(`\n저장 경로: ${outputPath}`);
