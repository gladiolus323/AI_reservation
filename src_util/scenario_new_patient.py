# -*- coding: utf-8 -*-
"""
시나리오: 새 환자 검사 예약
- 환자: P999999 (신규)
- 처방: 검사 4개
- 희망 예약: 2026년 2월 중
"""

import pandas as pd
from datetime import datetime, timedelta
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 데이터 로드
reservation = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\RESERVATION.csv')
exam_master = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\EXAM_MASTER.csv')
resource = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\RESOURCE.csv')
relation_rules = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\EXAM_RELATION_RULES.csv')
condition_rules = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\EXAM_CONDITION_RULES.csv')

reservation['RESERVATION_DATETIME'] = pd.to_datetime(reservation['RESERVATION_DATETIME'])
reservation['END_DATETIME'] = reservation['RESERVATION_DATETIME'] + pd.to_timedelta(reservation['DURATION_MIN'], unit='m')

print('='*70)
print('시나리오: 새 환자 검사 예약')
print('='*70)

# =============================================================================
# 1. 환자 정보 및 처방 내역
# =============================================================================
patient_id = 'P999999'
order_date = '2026-02-01'

# 처방된 검사 4개 (임상적으로 의미있는 조합)
orders = [
    {'exam_cd': 'RC060003', 'exam_nm': 'Abdomen CT (CE)'},           # 복부 CT 조영
    {'exam_cd': 'RM010029', 'exam_nm': '(3T)MRI-Liver (CE) + DWI'},  # 간 MRI
    {'exam_cd': 'RU010003', 'exam_nm': 'Abdomen(간.담낭.담도.비장.췌장)-정밀'},  # 복부 초음파
    {'exam_cd': 'SC030010', 'exam_nm': 'colon-Fiberscopy'},          # 대장내시경
]

print(f'\n환자 ID: {patient_id}')
print(f'처방일: {order_date}')
print(f'\n처방된 검사 ({len(orders)}건):')
for i, order in enumerate(orders, 1):
    exam_info = exam_master[exam_master['EXAM_CD'] == order['exam_cd']].iloc[0]
    print(f"  {i}. {order['exam_cd']} - {order['exam_nm']}")
    print(f"     장비: {exam_info['EQUIPMENT_TYPE']}, 소요시간: {exam_info['DURATION_MIN']}분")

# =============================================================================
# 2. 관련 규칙 확인
# =============================================================================
print('\n' + '='*70)
print('2. 관련 규칙 확인')
print('='*70)

exam_codes = [o['exam_cd'] for o in orders]

# 검사 간 관계 규칙
print('\n### 검사 간 관계 규칙 ###')
for i, exam_a in enumerate(exam_codes):
    for exam_b in exam_codes[i+1:]:
        rule = relation_rules[
            ((relation_rules['EXAM_A'] == exam_a) & (relation_rules['EXAM_B'] == exam_b)) |
            ((relation_rules['EXAM_A'] == exam_b) & (relation_rules['EXAM_B'] == exam_a))
        ]
        if len(rule) > 0:
            for _, r in rule.iterrows():
                print(f"  {r['EXAM_A']} ↔ {r['EXAM_B']}")
                if r['SEQ_REQ_YN'] == 'Y':
                    print(f"    → 순서 필수: {r['EXAM_A']} 먼저")
                if r['SAME_DAY_CD'] == 'N':
                    print(f"    → 당일 시행 불가")
                if r['SAME_DAY_CD'] == 'Y':
                    print(f"    → 당일 시행 권장")
                if pd.notna(r['GAP_VALUE']):
                    print(f"    → 간격 필요: {int(r['GAP_VALUE'])}{r['GAP_UNIT']}")
                if pd.notna(r['REASON_CD']):
                    print(f"    → 사유: {r['REASON_CD']}")

# 조건 규칙
print('\n### 조건 규칙 ###')
for exam_cd in exam_codes:
    cond = condition_rules[condition_rules['EXAM_CD'] == exam_cd]
    if len(cond) > 0:
        for _, c in cond.iterrows():
            print(f"  {exam_cd}: {c['ACTION_CD']}")
            if c['ACTION_CD'] == 'NOWEEKEND':
                print(f"    → 주말 시행 불가")
            elif c['ACTION_CD'] == 'FASTING':
                print(f"    → 금식 필요")
            elif c['ACTION_CD'] == 'GUARD':
                print(f"    → 보호자 동반 필요")
            elif c['ACTION_CD'] == 'CONSENT':
                print(f"    → 동의서 필요")

# =============================================================================
# 3. 예약 가능 슬롯 탐색 (2월 중)
# =============================================================================
print('\n' + '='*70)
print('3. 예약 가능 슬롯 탐색 (2026년 2월)')
print('='*70)

def find_available_slot(exam_cd, target_date, reservation_df, resource_df, exam_master_df):
    """특정 검사의 가용 슬롯 찾기"""
    exam_info = exam_master_df[exam_master_df['EXAM_CD'] == exam_cd].iloc[0]
    equip_type = exam_info['EQUIPMENT_TYPE']
    duration = int(exam_info['DURATION_MIN'])

    # 해당 장비의 자원 목록
    resources = resource_df[resource_df['EQUIPMENT_TYPE'] == equip_type]['RESOURCE_ID'].tolist()

    # 해당 날짜의 예약 현황
    day_reservations = reservation_df[
        (reservation_df['RESERVATION_DATE'] == target_date) &
        (reservation_df['EQUIPMENT_TYPE'] == equip_type)
    ].copy()

    # 운영 시간 (08:00~15:00)
    start_hour = 8
    end_hour = 15

    available_slots = []

    for resource_id in resources:
        res_reservations = day_reservations[day_reservations['RESOURCE_ID'] == resource_id].sort_values('RESERVATION_DATETIME')

        # 빈 슬롯 찾기
        current_time = datetime.strptime(f'{target_date} {start_hour:02d}:00', '%Y-%m-%d %H:%M')
        end_time = datetime.strptime(f'{target_date} {end_hour:02d}:00', '%Y-%m-%d %H:%M')

        for _, res in res_reservations.iterrows():
            res_start = res['RESERVATION_DATETIME']
            if current_time + timedelta(minutes=duration) <= res_start:
                available_slots.append({
                    'resource_id': resource_id,
                    'start_time': current_time,
                    'end_time': current_time + timedelta(minutes=duration)
                })
            current_time = max(current_time, res['END_DATETIME'])

        # 마지막 예약 이후 슬롯
        if current_time + timedelta(minutes=duration) <= end_time:
            available_slots.append({
                'resource_id': resource_id,
                'start_time': current_time,
                'end_time': current_time + timedelta(minutes=duration)
            })

    return available_slots

# 2월 평일 목록
feb_dates = []
for day in range(2, 29):  # 2월 2일부터 (처방일 다음날부터)
    date_str = f'2026-02-{day:02d}'
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    if date_obj.weekday() < 5:  # 월~금
        feb_dates.append(date_str)

# 각 검사별 가용 슬롯 탐색
print('\n각 검사별 첫 번째 가용 슬롯:')
proposed_schedule = []

for order in orders:
    exam_cd = order['exam_cd']
    exam_nm = order['exam_nm']
    exam_info = exam_master[exam_master['EXAM_CD'] == exam_cd].iloc[0]

    for target_date in feb_dates:
        slots = find_available_slot(exam_cd, target_date, reservation, resource, exam_master)
        if slots:
            slot = slots[0]  # 첫 번째 가용 슬롯
            proposed_schedule.append({
                'exam_cd': exam_cd,
                'exam_nm': exam_nm,
                'date': target_date,
                'start_time': slot['start_time'],
                'end_time': slot['end_time'],
                'resource_id': slot['resource_id'],
                'equipment_type': exam_info['EQUIPMENT_TYPE'],
                'duration': exam_info['DURATION_MIN']
            })
            print(f"  {exam_cd}: {target_date} {slot['start_time'].strftime('%H:%M')}~{slot['end_time'].strftime('%H:%M')} ({slot['resource_id']})")
            break

# =============================================================================
# 4. 규칙 기반 스케줄 조정
# =============================================================================
print('\n' + '='*70)
print('4. 규칙 기반 스케줄 조정')
print('='*70)

# RC060003 (CT) ↔ RM010029 (MRI): 순서 필수, CT가 먼저
# RC060003 (CT) ↔ SC030010 (대장내시경): 순서 필수, 내시경이 먼저, 당일 시행 권장

# 규칙 적용:
# 1. SC030010(대장내시경) → RC060003(CT) 순서 (같은 날 권장)
# 2. RC060003(CT) → RM010029(MRI) 순서
# 3. RU010003(초음파)는 제약 없음

print('\n적용할 규칙:')
print('  1. SC030010(대장내시경) → RC060003(CT): 내시경이 먼저, 같은 날 권장, 90분 간격')
print('  2. RC050002/RC060003(CT) → RM010029(MRI): 금식 관련, 당일 시행 권장')
print('  3. RU010003(초음파): 제약 없음')

# 최적 스케줄 제안
print('\n### 제안 스케줄 ###')
print(f'\n[2026-02-10 (화요일)] - 대장내시경 + CT 동시 진행')
print(f'  08:30~09:00 SC030010 대장내시경 (ENDO_01)')
print(f'  10:00~10:20 RC060003 복부CT조영 (CT_01) - 내시경 후 90분 간격')

print(f'\n[2026-02-11 (수요일)] - MRI + 초음파')
print(f'  09:00~09:45 RM010029 간MRI (MRI_01) - CT 다음날')
print(f'  10:00~10:20 RU010003 복부초음파 (US_01)')

# =============================================================================
# 5. 최종 예약 데이터
# =============================================================================
print('\n' + '='*70)
print('5. 최종 예약 데이터 (CSV 형식)')
print('='*70)

final_schedule = [
    {
        'RESERVATION_ID': 'R99990001',
        'ORDER_ID': 'O99990001',
        'PATIENT_ID': 'P999999',
        'ORDER_DATE': '2026-02-01',
        'EXAM_CD': 'SC030010',
        'EXAM_NM': 'colon-Fiberscopy',
        'RESERVATION_DATETIME': '2026-02-10 08:30',
        'RESERVATION_DATE': '2026-02-10',
        'RESERVATION_TIME': '08:30',
        'DURATION_MIN': 30,
        'EQUIPMENT_TYPE': 'ENDO',
        'RESOURCE_ID': 'ENDO_01'
    },
    {
        'RESERVATION_ID': 'R99990002',
        'ORDER_ID': 'O99990002',
        'PATIENT_ID': 'P999999',
        'ORDER_DATE': '2026-02-01',
        'EXAM_CD': 'RC060003',
        'EXAM_NM': 'Abdomen CT (CE)',
        'RESERVATION_DATETIME': '2026-02-10 10:00',
        'RESERVATION_DATE': '2026-02-10',
        'RESERVATION_TIME': '10:00',
        'DURATION_MIN': 20,
        'EQUIPMENT_TYPE': 'CT',
        'RESOURCE_ID': 'CT_01'
    },
    {
        'RESERVATION_ID': 'R99990003',
        'ORDER_ID': 'O99990003',
        'PATIENT_ID': 'P999999',
        'ORDER_DATE': '2026-02-01',
        'EXAM_CD': 'RM010029',
        'EXAM_NM': '(3T)MRI-Liver (CE) + DWI',
        'RESERVATION_DATETIME': '2026-02-11 09:00',
        'RESERVATION_DATE': '2026-02-11',
        'RESERVATION_TIME': '09:00',
        'DURATION_MIN': 45,
        'EQUIPMENT_TYPE': 'MRI',
        'RESOURCE_ID': 'MRI_01'
    },
    {
        'RESERVATION_ID': 'R99990004',
        'ORDER_ID': 'O99990004',
        'PATIENT_ID': 'P999999',
        'ORDER_DATE': '2026-02-01',
        'EXAM_CD': 'RU010003',
        'EXAM_NM': 'Abdomen(간.담낭.담도.비장.췌장)-정밀',
        'RESERVATION_DATETIME': '2026-02-11 10:00',
        'RESERVATION_DATE': '2026-02-11',
        'RESERVATION_TIME': '10:00',
        'DURATION_MIN': 20,
        'EQUIPMENT_TYPE': 'US',
        'RESOURCE_ID': 'US_01'
    }
]

print('\nRESERVATION_ID,ORDER_ID,PATIENT_ID,ORDER_DATE,EXAM_CD,EXAM_NM,RESERVATION_DATETIME,RESERVATION_DATE,RESERVATION_TIME,DURATION_MIN,EQUIPMENT_TYPE,RESOURCE_ID')
for row in final_schedule:
    print(f"{row['RESERVATION_ID']},{row['ORDER_ID']},{row['PATIENT_ID']},{row['ORDER_DATE']},{row['EXAM_CD']},{row['EXAM_NM']},{row['RESERVATION_DATETIME']},{row['RESERVATION_DATE']},{row['RESERVATION_TIME']},{row['DURATION_MIN']},{row['EQUIPMENT_TYPE']},{row['RESOURCE_ID']}")

# =============================================================================
# 6. 자원 충돌 확인
# =============================================================================
print('\n' + '='*70)
print('6. 자원 충돌 확인')
print('='*70)

for sched in final_schedule:
    target_date = sched['RESERVATION_DATE']
    resource_id = sched['RESOURCE_ID']
    start = datetime.strptime(sched['RESERVATION_DATETIME'], '%Y-%m-%d %H:%M')
    end = start + timedelta(minutes=sched['DURATION_MIN'])

    # 기존 예약과 충돌 확인
    conflicts = reservation[
        (reservation['RESERVATION_DATE'] == target_date) &
        (reservation['RESOURCE_ID'] == resource_id) &
        (reservation['RESERVATION_DATETIME'] < end) &
        (reservation['END_DATETIME'] > start)
    ]

    if len(conflicts) > 0:
        print(f"  ⚠ 충돌 발생: {sched['EXAM_CD']} ({resource_id}, {sched['RESERVATION_TIME']})")
        for _, c in conflicts.iterrows():
            print(f"     기존: {c['EXAM_CD']} {c['RESERVATION_TIME']}~{c['END_DATETIME'].strftime('%H:%M')}")
    else:
        print(f"  ✓ {sched['EXAM_CD']}: {target_date} {sched['RESERVATION_TIME']} ({resource_id}) - 충돌 없음")

print('\n' + '='*70)
print('시나리오 완료')
print('='*70)
