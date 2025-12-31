# -*- coding: utf-8 -*-
"""
RESOURCE.csv 생성 및 RESERVATION.csv에 RESOURCE_ID 배정
"""

import pandas as pd
from datetime import datetime, timedelta
import sys

sys.stdout.reconfigure(encoding='utf-8')

# =============================================================================
# 1. 장비별 자원 대수 정의 (예약 데이터 분석 결과)
# =============================================================================
RESOURCE_COUNTS = {
    'CT': 4,
    'MRI': 5,
    'US': 4,      # 3 -> 4 (자원 충돌 해결)
    'NM': 4,
    'ENDO': 5,
    'FUNC': 8,
    'XRAY': 3,    # 2 -> 3 (자원 충돌 해결)
    'FLUORO': 3
}

# =============================================================================
# 2. RESOURCE.csv 생성
# =============================================================================
print('='*70)
print('1. RESOURCE.csv 생성')
print('='*70)

resources = []
for equip_type in sorted(RESOURCE_COUNTS.keys()):
    count = RESOURCE_COUNTS[equip_type]
    for i in range(1, count + 1):
        resources.append({
            'RESOURCE_ID': f'{equip_type}_{i:02d}',
            'EQUIPMENT_TYPE': equip_type,
            'RESOURCE_NAME': f'{equip_type} {i}호기'
        })

resource_df = pd.DataFrame(resources)
resource_df.to_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\RESOURCE.csv', index=False, encoding='utf-8-sig')

print(f'총 자원 수: {len(resource_df)}개')
for equip_type in sorted(RESOURCE_COUNTS.keys()):
    print(f'  {equip_type}: {RESOURCE_COUNTS[equip_type]}대')

# =============================================================================
# 3. RESERVATION.csv에 RESOURCE_ID 배정
# =============================================================================
print('\n' + '='*70)
print('2. RESERVATION.csv에 RESOURCE_ID 배정')
print('='*70)

reservation = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\RESERVATION.csv')
reservation['RESERVATION_DATETIME'] = pd.to_datetime(reservation['RESERVATION_DATETIME'])
reservation['END_DATETIME'] = reservation['RESERVATION_DATETIME'] + pd.to_timedelta(reservation['DURATION_MIN'], unit='m')

# 자원 배정 결과 저장
reservation['RESOURCE_ID'] = ''

# 장비유형별 자원 목록
resource_lists = {}
for equip_type in RESOURCE_COUNTS.keys():
    resource_lists[equip_type] = [f'{equip_type}_{i:02d}' for i in range(1, RESOURCE_COUNTS[equip_type] + 1)]

# 각 날짜/장비유형별로 자원 배정
for equip_type in sorted(RESOURCE_COUNTS.keys()):
    equip_mask = reservation['EQUIPMENT_TYPE'] == equip_type
    equip_indices = reservation[equip_mask].index.tolist()

    # 날짜별로 처리
    dates = reservation.loc[equip_mask, 'RESERVATION_DATE'].unique()

    for date in dates:
        date_mask = equip_mask & (reservation['RESERVATION_DATE'] == date)
        day_data = reservation[date_mask].sort_values('RESERVATION_DATETIME')

        # 각 자원별 종료 시간 추적
        resource_end_times = {res_id: pd.Timestamp.min for res_id in resource_lists[equip_type]}

        for idx in day_data.index:
            start_time = reservation.loc[idx, 'RESERVATION_DATETIME']
            end_time = reservation.loc[idx, 'END_DATETIME']

            # 사용 가능한 자원 찾기 (시작 시간 이전에 종료된 자원)
            available = [res_id for res_id, end in resource_end_times.items() if end <= start_time]

            if available:
                # 가장 먼저 비는 자원 선택
                selected = min(available, key=lambda x: resource_end_times[x])
            else:
                # 모든 자원이 사용 중이면 가장 빨리 끝나는 자원 선택 (에러 케이스)
                selected = min(resource_end_times.keys(), key=lambda x: resource_end_times[x])
                print(f'  경고: 자원 부족 - {date}, {equip_type}, {start_time}')

            reservation.loc[idx, 'RESOURCE_ID'] = selected
            resource_end_times[selected] = end_time

print('자원 배정 완료')

# 컬럼 순서 정리 (RESOURCE_ID 추가)
columns = ['RESERVATION_ID', 'ORDER_ID', 'PATIENT_ID', 'ORDER_DATE', 'EXAM_CD', 'EXAM_NM',
           'RESERVATION_DATETIME', 'RESERVATION_DATE', 'RESERVATION_TIME', 'DURATION_MIN',
           'EQUIPMENT_TYPE', 'RESOURCE_ID']

# END_DATETIME 제거 후 저장
reservation = reservation[columns]
reservation.to_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\RESERVATION.csv', index=False, encoding='utf-8-sig')

print(f'RESERVATION.csv 업데이트 완료: {len(reservation)}건')

# =============================================================================
# 4. 자원 충돌 검증
# =============================================================================
print('\n' + '='*70)
print('3. 자원 충돌 검증')
print('='*70)

# 다시 로드하여 검증
reservation = pd.read_csv(r'c:\Users\user\Desktop\검사규칙 합성데이터\data\RESERVATION.csv')
reservation['RESERVATION_DATETIME'] = pd.to_datetime(reservation['RESERVATION_DATETIME'])
reservation['END_DATETIME'] = reservation['RESERVATION_DATETIME'] + pd.to_timedelta(reservation['DURATION_MIN'], unit='m')

conflict_count = 0

for resource_id in reservation['RESOURCE_ID'].unique():
    res_data = reservation[reservation['RESOURCE_ID'] == resource_id].copy()

    for date in res_data['RESERVATION_DATE'].unique():
        day_data = res_data[res_data['RESERVATION_DATE'] == date].sort_values('RESERVATION_DATETIME')

        for i in range(len(day_data) - 1):
            row1 = day_data.iloc[i]
            row2 = day_data.iloc[i + 1]

            if row1['END_DATETIME'] > row2['RESERVATION_DATETIME']:
                conflict_count += 1
                if conflict_count <= 5:
                    print(f'  충돌: {resource_id}, {date}')
                    print(f'    {row1["EXAM_CD"]}: {row1["RESERVATION_TIME"]} ~ {row1["END_DATETIME"].strftime("%H:%M")}')
                    print(f'    {row2["EXAM_CD"]}: {row2["RESERVATION_TIME"]} ~ {row2["END_DATETIME"].strftime("%H:%M")}')

if conflict_count == 0:
    print('자원 충돌 없음 ✓')
else:
    print(f'자원 충돌: {conflict_count}건')

# =============================================================================
# 5. 자원 사용 통계
# =============================================================================
print('\n' + '='*70)
print('4. 자원 사용 통계')
print('='*70)

resource_usage = reservation.groupby('RESOURCE_ID').size().reset_index(name='COUNT')
resource_usage = resource_usage.merge(resource_df[['RESOURCE_ID', 'EQUIPMENT_TYPE']], on='RESOURCE_ID')
resource_usage = resource_usage.sort_values(['EQUIPMENT_TYPE', 'RESOURCE_ID'])

for equip_type in sorted(RESOURCE_COUNTS.keys()):
    equip_usage = resource_usage[resource_usage['EQUIPMENT_TYPE'] == equip_type]
    total = equip_usage['COUNT'].sum()
    print(f'\n{equip_type} ({RESOURCE_COUNTS[equip_type]}대, 총 {total}건):')
    for _, row in equip_usage.iterrows():
        pct = row['COUNT'] / total * 100
        bar = '█' * int(pct / 5)
        print(f"  {row['RESOURCE_ID']}: {row['COUNT']:4}건 ({pct:5.1f}%) {bar}")
