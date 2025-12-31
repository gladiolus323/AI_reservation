# -*- coding: utf-8 -*-
"""
RESERVATION 합성 데이터 생성기 v2
- 2026년 1년간 약 10,000건 예약 생성
- 모든 규칙(EXAM_RELATION_RULES, EXAM_CONDITION_RULES) 준수
- 모든 검사 코드가 골고루 사용되도록 개선
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import sys

sys.stdout.reconfigure(encoding='utf-8')
random.seed(42)
np.random.seed(42)

# ============================================================================
# 데이터 로드
# ============================================================================
exam_master = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\EXAM_MASTER.csv')
relation_rules = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\EXAM_RELATION_RULES.csv')
condition_rules = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\EXAM_CONDITION_RULES.csv')

print(f"EXAM_MASTER: {len(exam_master)}개 검사")
print(f"RELATION_RULES: {len(relation_rules)}개 규칙")
print(f"CONDITION_RULES: {len(condition_rules)}개 규칙")

# ============================================================================
# 규칙 사전 구성
# ============================================================================

# NOWEEKEND 검사 목록
noweekend_exams = set(condition_rules[condition_rules['ACTION_CD'] == 'NOWEEKEND']['EXAM_CD'].unique())
print(f"\nNOWEEKEND 검사: {len(noweekend_exams)}개")

# SAME_DAY_CD = 'N' 규칙 (같은 날 시행 불가)
same_day_not_allowed = relation_rules[relation_rules['SAME_DAY_CD'] == 'N'].copy()

# GAP 규칙
gap_rules = relation_rules[relation_rules['GAP_VALUE'].notna()].copy()

# 검사 정보 딕셔너리
exam_info = {}
for _, row in exam_master.iterrows():
    exam_info[row['EXAM_CD']] = {
        'name': row['EXAM_NM'],
        'duration': int(row['DURATION_MIN']) if pd.notna(row['DURATION_MIN']) else 20,
        'equipment': row['EQUIPMENT_TYPE'],
        'fasting': row['FASTING_HRS'] if pd.notna(row['FASTING_HRS']) else 0,
        'avail_start': row['AVAIL_START_TIME'] if pd.notna(row['AVAIL_START_TIME']) else None,
        'avail_end': row['AVAIL_END_TIME'] if pd.notna(row['AVAIL_END_TIME']) else None
    }

# ============================================================================
# 장비별 검사 목록 구성
# ============================================================================
exams_by_type = {}
for exam_cd, info in exam_info.items():
    eq_type = info['equipment']
    if eq_type not in exams_by_type:
        exams_by_type[eq_type] = []
    exams_by_type[eq_type].append(exam_cd)

print("\n장비별 검사 수:")
for eq_type, exams in exams_by_type.items():
    print(f"  {eq_type}: {len(exams)}개")

# ============================================================================
# 검사 사용 카운터 (골고루 분배용)
# ============================================================================
exam_usage_count = {exam_cd: 0 for exam_cd in exam_info.keys()}

def get_least_used_exam(equipment_type, exclude_exams=None):
    """해당 장비 유형에서 가장 적게 사용된 검사 반환"""
    if exclude_exams is None:
        exclude_exams = set()

    candidates = [e for e in exams_by_type.get(equipment_type, []) if e not in exclude_exams]
    if not candidates:
        return None

    # 사용 횟수가 가장 적은 검사 선택 (약간의 랜덤성 추가)
    min_count = min(exam_usage_count[e] for e in candidates)
    least_used = [e for e in candidates if exam_usage_count[e] <= min_count + 2]
    return random.choice(least_used)

def get_random_exam(equipment_type, exclude_exams=None):
    """해당 장비 유형에서 랜덤 검사 반환 (사용 빈도 고려)"""
    if exclude_exams is None:
        exclude_exams = set()

    candidates = [e for e in exams_by_type.get(equipment_type, []) if e not in exclude_exams]
    if not candidates:
        return None

    # 사용 횟수에 반비례하는 가중치
    max_count = max(exam_usage_count[e] for e in candidates) + 1
    weights = [max_count - exam_usage_count[e] + 1 for e in candidates]

    return random.choices(candidates, weights=weights, k=1)[0]

# ============================================================================
# 검사 조합 정의 (현실적인 시나리오 + 다양성)
# ============================================================================

def generate_single_exam():
    """단일 검사 - 장비 유형별 균등 분배"""
    # 장비 유형 가중치 (실제 빈도 반영하되 골고루)
    equipment_weights = {
        'CT': 20, 'MRI': 18, 'US': 12, 'FUNC': 15,
        'ENDO': 10, 'NM': 8, 'XRAY': 8, 'FLUORO': 6
    }

    eq_type = random.choices(
        list(equipment_weights.keys()),
        weights=list(equipment_weights.values())
    )[0]

    exam = get_random_exam(eq_type)
    return [exam] if exam else None

def generate_hearing_test():
    """청력검사 그룹"""
    combos = [
        ['SC140005', 'SC140008'],  # PTA + Speech (기본)
        ['SC140005', 'SC140006', 'SC140008'],  # +IA
        ['SC140005', 'SC140006', 'SC140008', 'SC140010'],  # +OAE
        ['SC140005', 'SC140006', 'SC140007', 'SC140008', 'SC140009', 'SC140010'],  # 풀셋
        ['SC140005', 'SC140011'],  # PTA + BERA
    ]
    return random.choice(combos)

def generate_dementia_test():
    """치매검사 그룹"""
    combos = [
        ['SC160056', 'SC160058'],  # MMSE + CDR
        ['SC160058', 'SC160060', 'SC160062'],  # CDR + 노인우울 + CERAD-K
        ['SC160056', 'SC160058', 'SC160059', 'SC160060'],  # 기본 4종
        ['SC160056', 'SC160058', 'SC160059', 'SC160060', 'SC160061', 'SC160070'],  # 종합
        ['SC160064', 'SC160065'],  # 신경인지기능검사
        ['SC160086', 'SC160057'],  # K-MMSE2 + GDS
    ]
    return random.choice(combos)

def generate_pulmonary_test():
    """폐기능검사 그룹"""
    combos = [
        ['SC140014'],  # 호흡곡선 단독
        ['SC140014', 'SC140017'],  # 호흡곡선 + 기관지확장
        ['SC140014', 'SC140015'],  # 호흡곡선 + 체적기록법
        ['SC140014', 'SC140016'],  # 호흡곡선 + 폐확산능
        ['SC140014', 'SC140015', 'SC140016', 'SC140017'],  # 풀셋
    ]
    return random.choice(combos)

def generate_vestibular_test():
    """전정기능검사 그룹"""
    combos = [
        ['SC140020', 'SC140021'],  # 자발안진 + 두위
        ['SC140020', 'SC140021', 'SC140022', 'SC140026'],  # 4종
        ['SC140027', 'SC140028'],  # 급속안구운동 + 시표추적
        ['SC160008'],  # 어지럼증검사
        ['SC160010', 'SC160011'],  # VNG Test
    ]
    return random.choice(combos)

def generate_autonomic_test():
    """자율신경검사 그룹"""
    return ['SC160005', 'SC160006', 'SC160007']

def generate_emg_ncv_test():
    """근전도/신경전도검사 그룹"""
    combos = [
        ['SC160019', 'SC160023'],  # EMG상지 + NCV상지 운동
        ['SC160020', 'SC160025'],  # EMG하지 + NCV하지 운동
        ['SC160023', 'SC160024'],  # NCV상지 운동+감각
        ['SC160025', 'SC160026'],  # NCV하지 운동+감각
        ['SC160019', 'SC160020', 'SC160023', 'SC160025'],  # 상하지 종합
        ['SC160028'],  # 반복신경자극
        ['SC160030'],  # Blink Reflex
        ['SC160039', 'SC160040'],  # F파 검사
    ]
    return random.choice(combos)

def generate_endoscopy():
    """내시경검사"""
    combos = [
        ['SC030005'],  # 상부 일반
        ['SC030006'],  # 상부 수면
        ['SC030010'],  # 대장 일반
        ['SC030009'],  # 대장 수면
        ['SC030005', 'SC030010'],  # 상부+하부 일반
        ['SC030006', 'SC030009'],  # 상부+하부 수면
        ['SC030016'],  # S상결장경
        ['SC030017'],  # 내시경초음파
    ]
    return random.choice(combos)

def generate_cardiac_test():
    """심장검사 그룹"""
    combos = [
        ['SC010007'],  # 심초음파 단독
        ['SC010002'],  # Treadmill
        ['SC010003'],  # 24시간 Holter
        ['SC010004'],  # 48시간~7일 Holter
        ['SC010006'],  # 24시간 혈압
        ['SC010080'],  # 동맥경화도검사
        ['SC010007', 'SC010002'],  # 심초음파 + Treadmill
        ['SC060001'],  # CPX
    ]
    return random.choice(combos)

def generate_ct_exam():
    """CT 검사 - 다양한 부위"""
    exam = get_random_exam('CT')
    return [exam] if exam else None

def generate_mri_exam():
    """MRI 검사 - 다양한 부위"""
    exam = get_random_exam('MRI')
    return [exam] if exam else None

def generate_us_exam():
    """초음파 검사 - 다양한 부위"""
    exam = get_random_exam('US')
    return [exam] if exam else None

def generate_nm_exam():
    """핵의학 검사"""
    exam = get_random_exam('NM')
    return [exam] if exam else None

def generate_fluoro_exam():
    """투시촬영 검사"""
    combos = [
        ['RF010002'],  # Swallowing Evaluation
        ['RF020001'],  # Defecogram
        ['RF030001'],  # Esophagography
        ['RF040001'],  # VCUG
    ]
    return random.choice(combos)

def generate_xray_exam():
    """일반촬영 검사"""
    combos = [
        ['RX010001'],  # BMD
        ['RX020001'],  # Mammography
        ['RX030001'],  # EOS
    ]
    return random.choice(combos)

def generate_special_func():
    """특수 기능검사"""
    combos = [
        ['SC040001'],  # UBT
        ['SC050001'],  # 식도내압검사
        ['SC050002'],  # 항문내압검사
        ['SC070001'],  # PSG (야간)
        ['SC070002'],  # MSLT (주간)
        ['SC160050'],  # UPDRS
        ['SC160055'],  # 운동질환척도
        ['SC160033'],  # EEG
        ['SC160043'],  # 족부수분검사
    ]
    return random.choice(combos)

# 검사 조합 생성기 목록 (가중치 포함)
EXAM_GENERATORS = [
    (generate_single_exam, 40),          # 단일 검사 (다양한 장비)
    (generate_ct_exam, 8),               # CT
    (generate_mri_exam, 8),              # MRI
    (generate_us_exam, 6),               # 초음파
    (generate_nm_exam, 4),               # 핵의학
    (generate_hearing_test, 6),          # 청력검사
    (generate_dementia_test, 4),         # 치매검사
    (generate_pulmonary_test, 4),        # 폐기능검사
    (generate_vestibular_test, 3),       # 전정기능검사
    (generate_autonomic_test, 2),        # 자율신경검사
    (generate_emg_ncv_test, 4),          # 근전도/신경전도
    (generate_endoscopy, 6),             # 내시경
    (generate_cardiac_test, 5),          # 심장검사
    (generate_fluoro_exam, 3),           # 투시촬영
    (generate_xray_exam, 4),             # 일반촬영
    (generate_special_func, 3),          # 특수 기능검사
]

# 가중치 정규화
total_weight = sum(w for _, w in EXAM_GENERATORS)
generator_weights = [w/total_weight for _, w in EXAM_GENERATORS]
generators = [g for g, _ in EXAM_GENERATORS]

# ============================================================================
# 예약 생성 함수
# ============================================================================

def is_weekend_allowed(exam_cd, date):
    """주말 예약 가능 여부"""
    if date.weekday() >= 5:  # 토/일
        if exam_cd in noweekend_exams:
            return False
    if date.weekday() == 6:  # 일요일은 모든 검사 불가
        return False
    return True

def generate_time_slots(exams, date):
    """검사 목록에 대해 순차적 시간 슬롯 생성 (10분 단위)"""
    slots = []

    weekday = date.weekday()
    if weekday == 5:  # 토요일
        current_time = datetime.combine(date, datetime.strptime('08:30', '%H:%M').time())
        end_time = datetime.combine(date, datetime.strptime('12:30', '%H:%M').time())
    else:
        current_time = datetime.combine(date, datetime.strptime('08:30', '%H:%M').time())
        end_time = datetime.combine(date, datetime.strptime('17:30', '%H:%M').time())

    # 시작 시간을 랜덤하게 조정 (10분 단위로)
    total_duration = sum(exam_info.get(e, {}).get('duration', 20) for e in exams)
    available_minutes = (end_time - current_time).seconds // 60 - total_duration - 30

    if available_minutes > 0:
        # 10분 단위로 조정 (0, 10, 20, 30, ...)
        max_slots = min(available_minutes, 360) // 10
        offset_slots = random.randint(0, max_slots)
        current_time += timedelta(minutes=offset_slots * 10)

    for exam_cd in exams:
        info = exam_info.get(exam_cd, {})
        duration = info.get('duration', 20)

        # 검사별 운영시간 체크 (PSG, MSLT 등)
        if info.get('avail_start'):
            exam_start = datetime.strptime(info['avail_start'], '%H:%M').time()
            exam_end = datetime.strptime(info['avail_end'], '%H:%M').time()
            # 야간 검사 (PSG)
            if exam_start > exam_end:
                current_time = datetime.combine(date, exam_start)

        # 종료시간 초과 체크
        if current_time + timedelta(minutes=duration) > end_time:
            # PSG/MSLT 같은 야간 검사는 예외
            if not info.get('avail_start'):
                return None

        slots.append({
            'exam_cd': exam_cd,
            'start_time': current_time,
            'duration': duration
        })

        # 다음 검사 시작 시간도 10분 단위로 올림
        next_start = duration + 5
        next_start = ((next_start + 9) // 10) * 10  # 10분 단위로 올림
        current_time += timedelta(minutes=next_start)

    return slots

def check_patient_conflicts(patient_id, new_exams, new_date, patient_history):
    """환자의 기존 예약과 충돌 검사"""
    if patient_id not in patient_history:
        return True

    history = patient_history[patient_id]

    for new_exam in new_exams:
        for hist in history:
            hist_exam = hist['exam_cd']
            hist_date = hist['date']

            # SAME_DAY_CD = 'N' 체크
            if new_date == hist_date:
                conflict = same_day_not_allowed[
                    ((same_day_not_allowed['EXAM_A'] == new_exam) & (same_day_not_allowed['EXAM_B'] == hist_exam)) |
                    ((same_day_not_allowed['EXAM_A'] == hist_exam) & (same_day_not_allowed['EXAM_B'] == new_exam))
                ]
                if len(conflict) > 0:
                    return False

            # GAP 규칙 체크
            for _, rule in gap_rules.iterrows():
                if rule['EXAM_A'] == hist_exam and rule['EXAM_B'] == new_exam:
                    gap_value = int(rule['GAP_VALUE'])
                    gap_unit = rule['GAP_UNIT']

                    if gap_unit == 'D':
                        actual_gap = abs((new_date - hist_date).days)
                        if actual_gap < gap_value:
                            return False

    return True

# ============================================================================
# 메인 생성 로직
# ============================================================================

print("\n" + "="*60)
print("예약 데이터 생성 시작 (v2 - 골고루 분배)")
print("="*60)

# 2026년 날짜 목록 (일요일 제외)
start_date = datetime(2026, 1, 1)
end_date = datetime(2026, 12, 31)
all_dates = []
current = start_date
while current <= end_date:
    if current.weekday() != 6:  # 일요일 제외
        all_dates.append(current.date())
    current += timedelta(days=1)

print(f"운영일: {len(all_dates)}일")

# 목표: 약 10,000건
TARGET_TOTAL = 10000
daily_target = TARGET_TOTAL // len(all_dates)

print(f"일일 목표: {daily_target}건")

# 환자 ID 풀
patient_pool = [f"P{str(i).zfill(6)}" for i in range(1, 3001)]

# 예약 데이터 저장
reservations = []
patient_history = {}
reservation_id = 1

# 날짜별 생성
for date in all_dates:
    weekday = date.weekday()

    if weekday == 5:  # 토요일
        day_target = daily_target // 3
    else:
        day_target = daily_target + random.randint(-5, 5)

    day_count = 0
    attempts = 0
    max_attempts = day_target * 5

    while day_count < day_target and attempts < max_attempts:
        attempts += 1

        # 검사 조합 생성
        generator = random.choices(generators, weights=generator_weights)[0]
        exams = generator()

        if exams is None or not exams:
            continue

        # None 값 필터링
        exams = [e for e in exams if e is not None]
        if not exams:
            continue

        # 주말 검사 가능 여부 체크
        if weekday == 5:
            exams = [e for e in exams if is_weekend_allowed(e, date)]
            if not exams:
                continue

        # 시간 슬롯 생성
        slots = generate_time_slots(exams, datetime.combine(date, datetime.min.time()))
        if slots is None:
            continue

        # 환자 선택
        if random.random() < 0.3 and patient_history:
            patient_id = random.choice(list(patient_history.keys()))
        else:
            patient_id = random.choice(patient_pool)

        # 충돌 체크
        if not check_patient_conflicts(patient_id, exams, date, patient_history):
            continue

        # 예약 생성
        order_id = f"O{str(reservation_id).zfill(8)}"
        order_date = date - timedelta(days=random.randint(1, 14))

        for slot in slots:
            exam_cd = slot['exam_cd']
            info = exam_info.get(exam_cd, {})

            reservations.append({
                'RESERVATION_ID': f"R{str(reservation_id).zfill(8)}",
                'ORDER_ID': order_id,
                'PATIENT_ID': patient_id,
                'ORDER_DATE': order_date.strftime('%Y-%m-%d'),
                'EXAM_CD': exam_cd,
                'EXAM_NM': info.get('name', ''),
                'RESERVATION_DATETIME': slot['start_time'].strftime('%Y-%m-%d %H:%M'),
                'RESERVATION_DATE': date.strftime('%Y-%m-%d'),
                'RESERVATION_TIME': slot['start_time'].strftime('%H:%M'),
                'DURATION_MIN': slot['duration'],
                'EQUIPMENT_TYPE': info.get('equipment', '')
            })

            # 사용 카운터 업데이트
            exam_usage_count[exam_cd] += 1

            # 환자 이력 업데이트
            if patient_id not in patient_history:
                patient_history[patient_id] = []
            patient_history[patient_id].append({
                'exam_cd': exam_cd,
                'date': date
            })

            reservation_id += 1

        day_count += 1

    # 진행 상황 출력
    if date.day == 1:
        print(f"  {date.strftime('%Y-%m')}: 누적 {len(reservations)}건")

print(f"\n총 생성: {len(reservations)}건")
print(f"환자 수: {len(patient_history)}명")

# ============================================================================
# DataFrame 생성 및 저장
# ============================================================================

df = pd.DataFrame(reservations)
df = df.sort_values(['RESERVATION_DATE', 'RESERVATION_TIME', 'PATIENT_ID'])
df = df.reset_index(drop=True)

output_path = r'c:\Users\user\Desktop\검사규칙 합성데이터\data\RESERVATION.csv'
df.to_csv(output_path, index=False, encoding='utf-8-sig')

print(f"\n저장 완료: {output_path}")

# ============================================================================
# 통계 출력
# ============================================================================

print("\n" + "="*60)
print("생성 데이터 통계")
print("="*60)

print(f"\n### 기본 통계 ###")
print(f"총 예약 건수: {len(df)}건")
print(f"예약 기간: {df['RESERVATION_DATE'].min()} ~ {df['RESERVATION_DATE'].max()}")
print(f"고유 환자 수: {df['PATIENT_ID'].nunique()}명")
print(f"고유 검사 종류: {df['EXAM_CD'].nunique()}개 / {len(exam_info)}개")

print(f"\n### 장비별 분포 ###")
print(df['EQUIPMENT_TYPE'].value_counts().to_string())

print(f"\n### 장비별 검사 사용률 ###")
for eq_type in sorted(exams_by_type.keys()):
    total_exams = len(exams_by_type[eq_type])
    used_exams = df[df['EQUIPMENT_TYPE'] == eq_type]['EXAM_CD'].nunique()
    print(f"  {eq_type}: {used_exams}/{total_exams}개 ({used_exams/total_exams*100:.0f}%)")

print(f"\n### 요일별 분포 ###")
df['WEEKDAY'] = pd.to_datetime(df['RESERVATION_DATE']).dt.day_name()
print(df['WEEKDAY'].value_counts().to_string())

print(f"\n### 상위 15개 검사 ###")
print(df['EXAM_CD'].value_counts().head(15).to_string())

print(f"\n### 하위 15개 검사 (사용됨) ###")
print(df['EXAM_CD'].value_counts().tail(15).to_string())

# 미사용 검사 확인
used_exams = set(df['EXAM_CD'].unique())
all_exams = set(exam_info.keys())
unused = all_exams - used_exams
print(f"\n### 미사용 검사: {len(unused)}개 ###")
if unused:
    for eq_type in sorted(exams_by_type.keys()):
        unused_in_type = [e for e in unused if exam_info[e]['equipment'] == eq_type]
        if unused_in_type:
            print(f"  {eq_type}: {len(unused_in_type)}개")
