# -*- coding: utf-8 -*-
"""
생성된 RESERVATION 데이터의 규칙 준수 여부 검증
"""

import pandas as pd
from datetime import datetime, timedelta
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 데이터 로드
reservation = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\RESERVATION.csv')
relation_rules = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\EXAM_RELATION_RULES.csv')
condition_rules = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\EXAM_CONDITION_RULES.csv')

# 날짜/시간 변환
reservation['RESERVATION_DATE'] = pd.to_datetime(reservation['RESERVATION_DATE'])
reservation['RESERVATION_DATETIME'] = pd.to_datetime(reservation['RESERVATION_DATETIME'])
reservation['WEEKDAY'] = reservation['RESERVATION_DATE'].dt.day_name()

print('='*60)
print('규칙 위반 검사 보고서')
print('='*60)
print(f'총 예약 건수: {len(reservation)}건')

violations = []

# =============================================================================
# 1. 일요일 예약 검사
# =============================================================================
print('\n### 1. 일요일 예약 검사 ###')
sunday_reservations = reservation[reservation['WEEKDAY'] == 'Sunday']
print(f'일요일 예약: {len(sunday_reservations)}건')
if len(sunday_reservations) > 0:
    violations.append({'type': 'SUNDAY', 'count': len(sunday_reservations)})

# =============================================================================
# 2. 주말 예약 위반 검사 (NOWEEKEND 규칙)
# =============================================================================
print('\n### 2. 주말 예약 위반 검사 (NOWEEKEND) ###')

noweekend_exams = condition_rules[condition_rules['ACTION_CD'] == 'NOWEEKEND']['EXAM_CD'].unique()
print(f'NOWEEKEND 대상 검사: {list(noweekend_exams)}')

saturday_violations = reservation[
    (reservation['WEEKDAY'] == 'Saturday') &
    (reservation['EXAM_CD'].isin(noweekend_exams))
]

print(f'토요일 NOWEEKEND 위반: {len(saturday_violations)}건')
if len(saturday_violations) > 0:
    violations.append({'type': 'NOWEEKEND', 'count': len(saturday_violations)})
    for _, row in saturday_violations.head(5).iterrows():
        print(f"  {row['EXAM_CD']}, {row['RESERVATION_DATE'].strftime('%Y-%m-%d')}")

# =============================================================================
# 3. 당일 시행 불가 위반 검사 (SAME_DAY_CD=N)
# =============================================================================
print('\n### 3. 당일 시행 불가 위반 검사 (SAME_DAY_CD=N) ###')

same_day_not_allowed = relation_rules[relation_rules['SAME_DAY_CD'] == 'N'].copy()
same_day_violation_count = 0

for patient_id, patient_reservations in reservation.groupby('PATIENT_ID'):
    for date, date_reservations in patient_reservations.groupby('RESERVATION_DATE'):
        if len(date_reservations) < 2:
            continue

        exam_codes = date_reservations['EXAM_CD'].tolist()

        for i, exam_a in enumerate(exam_codes):
            for exam_b in exam_codes[i+1:]:
                rule = same_day_not_allowed[
                    ((same_day_not_allowed['EXAM_A'] == exam_a) & (same_day_not_allowed['EXAM_B'] == exam_b)) |
                    ((same_day_not_allowed['EXAM_A'] == exam_b) & (same_day_not_allowed['EXAM_B'] == exam_a))
                ]

                if len(rule) > 0:
                    same_day_violation_count += 1
                    if same_day_violation_count <= 5:
                        print(f"  환자:{patient_id}, {exam_a} + {exam_b}, 날짜:{str(date)[:10]}")

print(f'당일시행불가 위반 총: {same_day_violation_count}건')
if same_day_violation_count > 0:
    violations.append({'type': 'SAME_DAY_NOT_ALLOWED', 'count': same_day_violation_count})

# =============================================================================
# 4. 검사 간 간격 위반 검사
# =============================================================================
print('\n### 4. 검사 간 간격 위반 검사 (GAP) ###')

gap_rules = relation_rules[relation_rules['GAP_VALUE'].notna()].copy()
gap_rules['GAP_VALUE'] = gap_rules['GAP_VALUE'].astype(int)

gap_violation_count = 0

for patient_id, patient_reservations in reservation.groupby('PATIENT_ID'):
    patient_reservations = patient_reservations.sort_values('RESERVATION_DATETIME')

    for i, row1 in patient_reservations.iterrows():
        for j, row2 in patient_reservations.iterrows():
            if i >= j:
                continue

            exam_a = row1['EXAM_CD']
            exam_b = row2['EXAM_CD']

            rule = gap_rules[(gap_rules['EXAM_A'] == exam_a) & (gap_rules['EXAM_B'] == exam_b)]

            if len(rule) > 0:
                rule = rule.iloc[0]
                gap_value = int(rule['GAP_VALUE'])
                gap_unit = rule['GAP_UNIT']

                date1 = row1['RESERVATION_DATETIME']
                date2 = row2['RESERVATION_DATETIME']
                actual_gap = date2 - date1

                if gap_unit == 'D':
                    required_gap = timedelta(days=gap_value)
                elif gap_unit == 'H':
                    required_gap = timedelta(hours=gap_value)
                elif gap_unit == 'M':
                    required_gap = timedelta(minutes=gap_value)
                else:
                    continue

                if actual_gap < required_gap:
                    gap_violation_count += 1
                    if gap_violation_count <= 5:
                        print(f"  환자:{patient_id}, {exam_a}->{exam_b}, 필요:{gap_value}{gap_unit}, 실제:{actual_gap}")

print(f'간격 위반 총: {gap_violation_count}건')
if gap_violation_count > 0:
    violations.append({'type': 'GAP_INTERVAL', 'count': gap_violation_count})

# =============================================================================
# 5. 순서 위반 검사 (SEQ_REQ_YN=Y) - 같은 날 예약에 대해서만 체크
# =============================================================================
print('\n### 5. 순서 위반 검사 (SEQ_REQ_YN=Y, 같은 날) ###')

seq_required = relation_rules[relation_rules['SEQ_REQ_YN'] == 'Y'].copy()
seq_violation_count = 0

for patient_id, patient_reservations in reservation.groupby('PATIENT_ID'):
    # 같은 날짜별로 그룹화
    for date, date_reservations in patient_reservations.groupby('RESERVATION_DATE'):
        if len(date_reservations) < 2:
            continue

        date_reservations = date_reservations.sort_values('RESERVATION_DATETIME')
        exams_in_order = list(zip(date_reservations['EXAM_CD'], date_reservations['RESERVATION_DATETIME']))

        for i, (exam_a, time_a) in enumerate(exams_in_order):
            for j, (exam_b, time_b) in enumerate(exams_in_order):
                if i >= j:
                    continue

                # B -> A 순서가 필수인데, 실제로 A -> B 순서인 경우 체크
                rule = seq_required[(seq_required['EXAM_A'] == exam_b) & (seq_required['EXAM_B'] == exam_a)]

                if len(rule) > 0:
                    seq_violation_count += 1
                    if seq_violation_count <= 5:
                        print(f"  환자:{patient_id}, 실제:{exam_a}->{exam_b}, 규칙:{exam_b}가 먼저")

print(f'순서 위반 총: {seq_violation_count}건')
if seq_violation_count > 0:
    violations.append({'type': 'SEQ_ORDER', 'count': seq_violation_count})

# =============================================================================
# 요약
# =============================================================================
print('\n' + '='*60)
print('위반 요약')
print('='*60)

total_violations = sum(v['count'] for v in violations)
print(f'1. 일요일 예약: {len(sunday_reservations)}건')
print(f'2. NOWEEKEND 위반: {len(saturday_violations)}건')
print(f'3. 당일시행불가 위반: {same_day_violation_count}건')
print(f'4. 간격 위반: {gap_violation_count}건')
print(f'5. 순서 위반: {seq_violation_count}건')
print(f'\n총 위반: {total_violations}건')

if total_violations == 0:
    print('\n✓ 모든 규칙을 준수합니다!')
else:
    print(f'\n⚠ {total_violations}건의 규칙 위반이 발견되었습니다.')

# =============================================================================
# 추가 통계
# =============================================================================
print('\n' + '='*60)
print('추가 통계')
print('='*60)

# 그룹 예약 분석
grouped = reservation.groupby(['PATIENT_ID', 'RESERVATION_DATE']).size().reset_index(name='COUNT')
multi_booking = grouped[grouped['COUNT'] >= 2]

print(f'\n### 동일 환자, 동일 날짜 다중 예약 ###')
print(f'다중 예약 건수: {len(multi_booking)}건')
print(f'다중 예약 분포:')
print(multi_booking['COUNT'].value_counts().sort_index().to_string())

# 환자당 예약 수
patient_counts = reservation.groupby('PATIENT_ID').size()
print(f'\n### 환자당 예약 수 ###')
print(f'평균: {patient_counts.mean():.1f}건')
print(f'최대: {patient_counts.max()}건')
print(f'분포:')
print(patient_counts.value_counts().sort_index().head(10).to_string())
