# -*- coding: utf-8 -*-
"""
예약 시간표 뷰어
- 날짜별 시간표 형식
- 10분 단위 블럭
- 마우스 호버 시 예약 정보 표시
"""

import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
import os

# 페이지 설정
st.set_page_config(
    page_title="검사 예약 시간표",
    page_icon="📅",
    layout="wide"
)

# CSS 스타일
st.markdown("""
<style>
    .time-block {
        width: 100%;
        height: 25px;
        border: 1px solid #ddd;
        border-radius: 2px;
        margin: 1px 0;
    }
    .occupied {
        background-color: #4CAF50;
        cursor: pointer;
    }
    .empty {
        background-color: #f5f5f5;
    }
    .resource-header {
        font-weight: bold;
        text-align: center;
        padding: 5px;
        background-color: #e0e0e0;
        border-radius: 4px;
        margin-bottom: 5px;
    }
    .time-label {
        font-size: 11px;
        color: #666;
        text-align: right;
        padding-right: 5px;
    }
    .tooltip {
        position: relative;
        display: inline-block;
        width: 100%;
    }
    .stColumn {
        padding: 0 2px !important;
    }
</style>
""", unsafe_allow_html=True)

# 데이터 로드
@st.cache_data
def load_data():
    base_path = r'c:\Users\user\Desktop\검사규칙 합성데이터\data'
    reservation = pd.read_csv(os.path.join(base_path, 'RESERVATION.csv'))
    resource = pd.read_csv(os.path.join(base_path, 'RESOURCE.csv'))

    reservation['RESERVATION_DATETIME'] = pd.to_datetime(reservation['RESERVATION_DATETIME'])
    reservation['END_DATETIME'] = reservation['RESERVATION_DATETIME'] + pd.to_timedelta(reservation['DURATION_MIN'], unit='m')

    return reservation, resource

reservation, resource = load_data()

# 사이드바
st.sidebar.title("📅 검사 예약 시간표")

# 날짜 선택
available_dates = sorted(reservation['RESERVATION_DATE'].unique())
selected_date = st.sidebar.selectbox(
    "날짜 선택",
    available_dates,
    index=available_dates.index('2026-02-10') if '2026-02-10' in available_dates else 0
)

# 장비유형 선택
equipment_types = sorted(reservation['EQUIPMENT_TYPE'].unique())
selected_equipment = st.sidebar.selectbox(
    "장비유형",
    ['전체'] + equipment_types
)

# 시간 범위
start_hour = st.sidebar.slider("시작 시간", 6, 12, 8)
end_hour = st.sidebar.slider("종료 시간", 14, 22, 16)

# 메인 화면
st.title(f"📅 {selected_date} 예약 시간표")

# 해당 날짜 예약 필터
day_reservations = reservation[reservation['RESERVATION_DATE'] == selected_date].copy()

if selected_equipment != '전체':
    day_reservations = day_reservations[day_reservations['EQUIPMENT_TYPE'] == selected_equipment]
    resources_to_show = resource[resource['EQUIPMENT_TYPE'] == selected_equipment]['RESOURCE_ID'].tolist()
else:
    resources_to_show = resource['RESOURCE_ID'].tolist()

st.caption(f"총 {len(day_reservations)}건의 예약")

# 10분 단위 시간 슬롯 생성
time_slots = []
current = datetime.strptime(f"{selected_date} {start_hour:02d}:00", "%Y-%m-%d %H:%M")
end = datetime.strptime(f"{selected_date} {end_hour:02d}:00", "%Y-%m-%d %H:%M")

while current < end:
    time_slots.append(current)
    current += timedelta(minutes=10)

# 자원별 예약 현황 계산
def get_reservation_at_time(resource_id, time_slot, reservations_df):
    """특정 자원, 특정 시간의 예약 조회"""
    slot_end = time_slot + timedelta(minutes=10)

    matches = reservations_df[
        (reservations_df['RESOURCE_ID'] == resource_id) &
        (reservations_df['RESERVATION_DATETIME'] < slot_end) &
        (reservations_df['END_DATETIME'] > time_slot)
    ]

    if len(matches) > 0:
        return matches.iloc[0]
    return None

# 장비유형별로 그룹화하여 표시
if selected_equipment == '전체':
    equipment_groups = equipment_types
else:
    equipment_groups = [selected_equipment]

for equip_type in equipment_groups:
    equip_resources = resource[resource['EQUIPMENT_TYPE'] == equip_type]['RESOURCE_ID'].tolist()

    if not equip_resources:
        continue

    st.subheader(f"🏥 {equip_type}")

    # 컬럼 생성: 시간 라벨 + 각 자원
    cols = st.columns([1] + [2] * len(equip_resources))

    # 헤더
    cols[0].markdown("**시간**")
    for i, res_id in enumerate(equip_resources):
        cols[i + 1].markdown(f"**{res_id}**")

    # 시간 슬롯별 표시
    for time_slot in time_slots:
        cols = st.columns([1] + [2] * len(equip_resources))

        # 시간 라벨 (정각만 표시)
        if time_slot.minute == 0:
            cols[0].markdown(f"<div class='time-label'>{time_slot.strftime('%H:%M')}</div>", unsafe_allow_html=True)
        else:
            cols[0].markdown("")

        # 각 자원별 블럭
        for i, res_id in enumerate(equip_resources):
            res_data = day_reservations[day_reservations['RESOURCE_ID'] == res_id]
            reservation_info = get_reservation_at_time(res_id, time_slot, res_data)

            if reservation_info is not None:
                # 예약 있음 - 색상 블럭 + 툴팁
                tooltip_text = f"""
                🏷️ {reservation_info['EXAM_CD']}
                📋 {reservation_info['EXAM_NM']}
                👤 {reservation_info['PATIENT_ID']}
                ⏰ {reservation_info['RESERVATION_TIME']} ({reservation_info['DURATION_MIN']}분)
                """
                cols[i + 1].markdown(
                    f"""<div class="time-block occupied" title="{tooltip_text.strip()}"></div>""",
                    unsafe_allow_html=True
                )
            else:
                # 빈 슬롯
                cols[i + 1].markdown(
                    f"""<div class="time-block empty"></div>""",
                    unsafe_allow_html=True
                )

    st.markdown("---")

# 하단 범례
st.markdown("""
### 범례
- 🟩 **녹색**: 예약됨 (마우스 올리면 상세 정보)
- ⬜ **회색**: 비어있음
""")

# 해당 날짜 예약 목록
with st.expander("📋 예약 목록 상세"):
    if len(day_reservations) > 0:
        st.dataframe(
            day_reservations[['RESERVATION_TIME', 'RESOURCE_ID', 'EXAM_CD', 'EXAM_NM', 'PATIENT_ID', 'DURATION_MIN']].sort_values('RESERVATION_TIME'),
            use_container_width=True
        )
    else:
        st.info("해당 날짜에 예약이 없습니다.")
