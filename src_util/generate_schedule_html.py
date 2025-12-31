# -*- coding: utf-8 -*-
"""
예약 시간표 HTML 생성기 (날짜 선택 가능)
- 날짜별 시간표 형식
- 10분 단위 블럭
- 마우스 호버 시 예약 정보 표시
"""

import pandas as pd
from datetime import datetime, timedelta
import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

# 데이터 로드
base_path = r'c:\Users\user\Desktop\검사규칙 합성데이터\data'
reservation = pd.read_csv(os.path.join(base_path, 'RESERVATION.csv'))
resource = pd.read_csv(os.path.join(base_path, 'RESOURCE.csv'))

reservation['RESERVATION_DATETIME'] = pd.to_datetime(reservation['RESERVATION_DATETIME'])
reservation['END_DATETIME'] = reservation['RESERVATION_DATETIME'] + pd.to_timedelta(reservation['DURATION_MIN'], unit='m')

# 모든 날짜 목록
all_dates = sorted(reservation['RESERVATION_DATE'].unique())

# 예약 데이터를 JSON으로 변환
reservations_json = []
for _, row in reservation.iterrows():
    reservations_json.append({
        'date': row['RESERVATION_DATE'],
        'resource_id': row['RESOURCE_ID'],
        'equipment_type': row['EQUIPMENT_TYPE'],
        'start': row['RESERVATION_DATETIME'].strftime('%Y-%m-%d %H:%M'),
        'end': row['END_DATETIME'].strftime('%Y-%m-%d %H:%M'),
        'exam_cd': row['EXAM_CD'],
        'exam_nm': row['EXAM_NM'][:30] if len(row['EXAM_NM']) > 30 else row['EXAM_NM'],
        'patient_id': row['PATIENT_ID'],
        'time': row['RESERVATION_TIME'],
        'duration': int(row['DURATION_MIN'])
    })

# 자원 데이터
resources_json = {}
for equip_type in resource['EQUIPMENT_TYPE'].unique():
    resources_json[equip_type] = resource[resource['EQUIPMENT_TYPE'] == equip_type]['RESOURCE_ID'].tolist()

print(f'HTML 생성 중...')

html_content = '''<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>검사 예약 시간표</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f5;
            padding: 20px;
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
        }
        .controls {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .nav-buttons {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
            justify-content: center;
        }
        .controls label {
            margin-right: 10px;
            font-weight: bold;
        }
        .controls select, .controls input[type="date"] {
            padding: 8px 15px;
            font-size: 14px;
            border-radius: 4px;
            border: 1px solid #ccc;
            margin-right: 20px;
        }
        .controls input[type="date"] {
            cursor: pointer;
        }
        .controls button {
            padding: 8px 20px;
            font-size: 14px;
            border-radius: 4px;
            border: none;
            background: #4CAF50;
            color: white;
            cursor: pointer;
            margin: 0 5px;
        }
        .controls button:hover {
            background: #45a049;
        }
        .legend {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
        }
        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 3px;
        }
        .equipment-section {
            background: white;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .grid-wrapper {
            overflow-x: auto;
        }
        .equipment-title {
            font-size: 16px;
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 2px solid #eee;
        }
        /* 일간 뷰 스타일 - 그리드 형태 */
        .day-grid {
            display: grid;
            gap: 0;
            background: white;
            border: 1px solid #ddd;
            overflow: visible;
            margin-bottom: 20px;
            min-width: fit-content;
            flex: 1;
        }
        .day-header {
            background: #e0e0e0;
            padding: 8px 2px;
            text-align: center;
            font-weight: bold;
            font-size: 10px;
            border-bottom: 1px solid #ddd;
            border-right: 1px solid #eee;
        }
        .day-header:last-child {
            border-right: none;
        }
        .day-header.equip-start {
            border-left: 2px solid #999;
        }
        .day-header.time-col {
            background: #e0e0e0;
            position: sticky;
            left: 0;
            z-index: 11;
            border-left: 1px solid #ddd;
        }
        .day-equip-header {
            background: #d0d0d0;
            padding: 6px 4px;
            text-align: center;
            font-weight: bold;
            font-size: 11px;
            border-bottom: 1px solid #bbb;
            border-right: 1px solid #eee;
        }
        .day-equip-header.equip-start {
            border-left: 2px solid #999;
        }
        .day-equip-header.time-col {
            background: #d0d0d0;
            position: sticky;
            left: 0;
            z-index: 11;
            border-left: 1px solid #ddd;
        }
        .day-time-cell {
            background: #f9f9f9;
            padding: 2px 8px;
            text-align: center;
            font-size: 11px;
            font-weight: bold;
            color: #555;
            display: flex;
            align-items: center;
            justify-content: center;
            border-left: 1px solid #ddd;
            border-right: 1px solid #ddd;
            border-bottom: 1px solid #ccc;
            position: sticky;
            left: 0;
            z-index: 10;
        }
        .day-cell {
            background: white;
            height: 25px;
            position: relative;
            border-right: 1px solid #eee;
            border-bottom: 1px solid #eee;
            overflow: visible;
        }
        .day-cell:last-child {
            border-right: none;
        }
        .day-cell.hour-end {
            border-bottom: 1px solid #ccc;
        }
        .day-cell.equip-start {
            border-left: 2px solid #999;
        }
        .day-block {
            position: absolute;
            left: 2px;
            right: 2px;
            cursor: pointer;
            opacity: 0.85;
            border-radius: 3px;
            font-size: 10px;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            font-weight: bold;
            z-index: 5;
        }
        .day-block.highlight {
            opacity: 1;
            z-index: 10;
        }
        .stats {
            text-align: center;
            margin-bottom: 15px;
            color: #666;
            font-size: 14px;
        }
        #schedule-container {
            min-height: 400px;
        }
        .no-data {
            text-align: center;
            padding: 50px;
            color: #999;
            font-size: 16px;
        }
        /* 주간 뷰 스타일 */
        .week-grid {
            display: grid;
            grid-template-columns: 60px repeat(7, 1fr);
            gap: 0;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: visible;
            margin-bottom: 20px;
        }
        .week-header {
            background: #e0e0e0;
            padding: 8px 4px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            border-bottom: 1px solid #ddd;
            border-right: 1px solid #ddd;
        }
        .week-header:last-child {
            border-right: none;
        }
        .week-header.today {
            background: #4CAF50;
            color: white;
        }
        .week-resource-header {
            background: #f5f5f5;
            border-bottom: 1px solid #ddd;
            border-right: 1px solid #ddd;
        }
        .week-resource-row {
            background: #f5f5f5;
            display: flex;
            gap: 1px;
            padding: 2px 1px;
            border-bottom: 1px solid #ddd;
            border-right: 1px solid #ddd;
        }
        .week-resource-row:last-child {
            border-right: none;
        }
        .week-resource-label {
            flex: 1;
            text-align: center;
            font-size: 10px;
            font-weight: bold;
            color: #666;
        }
        .week-time-cell {
            background: #f9f9f9;
            padding: 2px 8px;
            text-align: center;
            font-size: 11px;
            font-weight: bold;
            color: #555;
            display: flex;
            align-items: center;
            justify-content: center;
            border-right: 1px solid #ddd;
            border-bottom: 1px solid #ccc;
        }
        .week-cell {
            background: white;
            height: 30px;
            position: relative;
            display: flex;
            flex-direction: row;
            gap: 1px;
            padding: 0 1px;
            border-right: 1px solid #eee;
            border-bottom: 1px solid #eee;
            overflow: visible;
        }
        .week-cell:last-child {
            border-right: none;
        }
        .week-cell.hour-end {
            border-bottom: 1px solid #ccc;
        }
        .week-block-wrapper {
            flex: 1;
            position: relative;
            height: 100%;
            overflow: visible;
        }
        .week-block {
            position: absolute;
            left: 0;
            right: 0;
            cursor: pointer;
            opacity: 0.85;
            border-radius: 2px;
            font-size: 9px;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            font-weight: bold;
            z-index: 5;
        }
        .week-block.empty {
            position: relative;
            height: 100%;
            background: transparent;
            opacity: 1;
            cursor: default;
        }
        .week-block.highlight {
            opacity: 1;
            z-index: 10;
        }
        /* 마우스 hover 정보 박스 */
        #balloon {
            display: none;
            position: fixed;
            background: rgba(50, 50, 50, 0.95);
            color: white;
            border-radius: 6px;
            padding: 10px 14px;
            font-size: 12px;
            box-shadow: 0 3px 12px rgba(0,0,0,0.3);
            z-index: 9999;
            pointer-events: none;
            max-width: 280px;
            line-height: 1.5;
        }
        #balloon .balloon-title {
            font-weight: bold;
            font-size: 13px;
            margin-bottom: 6px;
            padding-bottom: 5px;
            border-bottom: 1px solid rgba(255,255,255,0.3);
        }
        #balloon .balloon-row {
            display: flex;
            margin: 3px 0;
        }
        #balloon .balloon-label {
            color: #aaa;
            min-width: 65px;
        }
        #balloon .balloon-value {
            color: white;
        }
        .view-toggle {
            display: inline-flex;
            border-radius: 4px;
            overflow: hidden;
            margin-right: 20px;
        }
        .view-toggle button {
            border-radius: 0;
            border: 1px solid #4CAF50;
            background: white;
            color: #4CAF50;
        }
        .view-toggle button.active {
            background: #4CAF50;
            color: white;
        }
        .view-toggle button:first-child {
            border-radius: 4px 0 0 4px;
        }
        .view-toggle button:last-child {
            border-radius: 0 4px 4px 0;
        }
    </style>
</head>
<body>
    <!-- 마우스 따라다니는 말풍선 -->
    <div id="balloon"></div>

    <h1>📅 검사 예약 시간표</h1>

    <div class="controls">
        <label>날짜:</label>
        <input type="date" id="dateSelect" value="2026-02-10" min="2026-01-01" max="2026-12-31">

        <label>장비:</label>
        <select id="equipSelect">
            <option value="ALL">전체</option>
            <option value="CT">CT</option>
            <option value="MRI">MRI</option>
            <option value="US">US</option>
            <option value="NM">NM</option>
            <option value="ENDO">ENDO</option>
            <option value="FUNC">FUNC</option>
            <option value="XRAY">XRAY</option>
            <option value="FLUORO">FLUORO</option>
        </select>

        <div class="view-toggle">
            <button id="dayViewBtn" class="active" onclick="setView('day')">일간</button>
            <button id="weekViewBtn" onclick="setView('week')">주간</button>
        </div>

        <div class="nav-buttons">
            <button onclick="moveDate(-7)">◀◀ 1주 전</button>
            <button onclick="moveDate(-1)">◀ 1일 전</button>
            <button onclick="moveDate(1)">1일 후 ▶</button>
            <button onclick="moveDate(7)">1주 후 ▶▶</button>
        </div>
    </div>

    <div class="legend">
        <div class="legend-item"><div class="legend-color" style="background:#4CAF50"></div><span>CT</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#2196F3"></div><span>MRI</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#FF9800"></div><span>US</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#9C27B0"></div><span>NM</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#E91E63"></div><span>ENDO</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#00BCD4"></div><span>FUNC</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#795548"></div><span>XRAY</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#607D8B"></div><span>FLUORO</span></div>
    </div>

    <div id="stats" class="stats"></div>
    <div id="schedule-container"></div>

    <script>
'''

# JSON 데이터 삽입
html_content += f'        const reservations = {json.dumps(reservations_json, ensure_ascii=False)};\n'
html_content += f'        const resources = {json.dumps(resources_json, ensure_ascii=False)};\n'
html_content += f'        const allDates = {json.dumps(all_dates)};\n'

html_content += '''
        const equipColors = {
            'CT': '#4CAF50',
            'MRI': '#2196F3',
            'US': '#FF9800',
            'NM': '#9C27B0',
            'ENDO': '#E91E63',
            'FUNC': '#00BCD4',
            'XRAY': '#795548',
            'FLUORO': '#607D8B'
        };

        function renderSchedule() {
            const selectedDate = document.getElementById('dateSelect').value;
            const selectedEquip = document.getElementById('equipSelect').value;

            let dayReservations = reservations.filter(r => r.date === selectedDate);

            if (selectedEquip !== 'ALL') {
                dayReservations = dayReservations.filter(r => r.equipment_type === selectedEquip);
            }

            document.getElementById('stats').textContent = `총 예약: ${dayReservations.length}건`;

            const container = document.getElementById('schedule-container');
            container.innerHTML = '';

            if (dayReservations.length === 0) {
                container.innerHTML = '<div class="no-data">해당 날짜에 예약이 없습니다.</div>';
                return;
            }

            // 장비별 자원 목록 수집
            const equipTypes = selectedEquip === 'ALL' ? ['CT', 'MRI', 'US', 'NM', 'ENDO', 'FUNC', 'XRAY', 'FLUORO'] : [selectedEquip];

            // 전체 자원 목록 구성 (장비별 자원) - 예약이 없어도 모든 장비 표시
            let allResources = [];
            equipTypes.forEach(equipType => {
                const equipRes = resources[equipType] || [];
                equipRes.forEach((resId, idx) => {
                    allResources.push({
                        resourceId: resId,
                        equipType: equipType,
                        isFirst: idx === 0  // 장비의 첫 번째 자원
                    });
                });
            });

            // 하나의 통합 그리드 생성
            const section = document.createElement('div');
            section.className = 'equipment-section';

            const grid = document.createElement('div');
            grid.className = 'day-grid';
            grid.style.gridTemplateColumns = `50px repeat(${allResources.length}, minmax(35px, 1fr))`;

            // 1행: 장비 유형 헤더 (클릭 시 해당 장비만 필터)
            grid.innerHTML = '<div class="day-equip-header time-col"></div>';
            equipTypes.forEach(equipType => {
                const equipRes = resources[equipType] || [];
                const equipCount = dayReservations.filter(r => r.equipment_type === equipType).length;
                grid.innerHTML += `<div class="day-equip-header equip-start" style="grid-column: span ${equipRes.length}; background:${equipColors[equipType]}; color:white; cursor:pointer;" onclick="selectEquipment('${equipType}')">${equipType} (${equipCount})</div>`;
            });

            // 2행: 자원 번호 헤더
            grid.innerHTML += '<div class="day-header time-col">시간</div>';
            allResources.forEach(res => {
                const resNum = res.resourceId.split('_')[1];
                grid.innerHTML += `<div class="day-header${res.isFirst ? ' equip-start' : ''}">${resNum}</div>`;
            });

            // 시간 슬롯: FUNC 장비만 선택 시 22시까지, 그 외 16시까지
            const endHour = (selectedEquip === 'FUNC') ? 22 : 16;
            const slotDuration = 10 * 60000;

            for (let h = 8; h < endHour; h++) {
                // 정각에 시간 셀 추가 (6행 병합)
                const timeStr = `${h.toString().padStart(2,'0')}:00`;
                const timeCell = document.createElement('div');
                timeCell.className = 'day-time-cell';
                timeCell.style.gridRow = `span 6`;
                timeCell.textContent = timeStr;
                grid.appendChild(timeCell);

                for (let m = 0; m < 60; m += 10) {
                    const slotTimeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                    const slotStart = new Date(`${selectedDate} ${slotTimeStr}`);
                    const slotEnd = new Date(slotStart.getTime() + slotDuration);
                    const isHourEnd = (m === 50);

                    // 각 자원별 셀
                    allResources.forEach(res => {
                        const cell = document.createElement('div');
                        let cellClass = 'day-cell';
                        if (isHourEnd) cellClass += ' hour-end';
                        if (res.isFirst) cellClass += ' equip-start';
                        cell.className = cellClass;

                        // 이 슬롯에서 시작하는 예약 찾기
                        const reservation = dayReservations.find(r => {
                            const rStart = new Date(r.start);
                            return r.resource_id === res.resourceId &&
                                   rStart.getTime() >= slotStart.getTime() &&
                                   rStart.getTime() < slotEnd.getTime();
                        });

                        if (reservation) {
                            const r = reservation;
                            const rStart = new Date(r.start);
                            let rEnd = new Date(r.end);
                            const color = equipColors[res.equipType];
                            const blockId = `${r.resource_id}_${r.start}`.replace(/[: ]/g, '_');

                            // 그리드 종료 시간(22:00)을 넘어가면 잘라서 표시
                            const gridEnd = new Date(`${selectedDate} ${endHour.toString().padStart(2,'0')}:00`);
                            if (rEnd > gridEnd) rEnd = gridEnd;

                            const topPercent = ((rStart.getTime() - slotStart.getTime()) / slotDuration) * 100;
                            const heightPercent = ((rEnd.getTime() - rStart.getTime()) / slotDuration) * 100;

                            cell.innerHTML = `
                                <div class="day-block" style="background:${color}; top:${topPercent}%; height:${heightPercent}%;"
                                     data-block-id="${blockId}"
                                     data-resource="${res.resourceId}"
                                     data-exam-cd="${r.exam_cd}"
                                     data-exam-nm="${r.exam_nm}"
                                     data-patient="${r.patient_id}"
                                     data-time="${r.time}"
                                     data-duration="${r.duration}">
                                </div>`;
                        }

                        grid.appendChild(cell);
                    });
                }
            }

            // grid-wrapper로 감싸기
            const wrapper = document.createElement('div');
            wrapper.className = 'grid-wrapper';

            wrapper.appendChild(grid);
            section.appendChild(wrapper);
            container.appendChild(section);

            // hover 이벤트 연결 - 말풍선 표시
            container.querySelectorAll('.day-block').forEach(block => {
                block.addEventListener('mouseenter', function(e) {
                    const blockId = this.getAttribute('data-block-id');
                    document.querySelectorAll(`.day-block[data-block-id="${blockId}"]`).forEach(b => {
                        b.classList.add('highlight');
                    });
                    showBalloon(this, e);
                });
                block.addEventListener('mousemove', function(e) {
                    moveBalloon(e);
                });
                block.addEventListener('mouseleave', function() {
                    const blockId = this.getAttribute('data-block-id');
                    document.querySelectorAll(`.day-block[data-block-id="${blockId}"]`).forEach(b => {
                        b.classList.remove('highlight');
                    });
                    hideBalloon();
                });
            });
        }

        let currentView = 'day'; // 'day' or 'week'

        function setView(view) {
            currentView = view;
            document.getElementById('dayViewBtn').classList.toggle('active', view === 'day');
            document.getElementById('weekViewBtn').classList.toggle('active', view === 'week');
            render();
        }

        function selectDate(date) {
            document.getElementById('dateSelect').value = date;
            render();
        }

        function selectEquipment(equipType) {
            document.getElementById('equipSelect').value = equipType;
            render();
        }

        // 말풍선 함수들
        const balloon = document.getElementById('balloon');

        function showBalloon(block, e) {
            const resource = block.getAttribute('data-resource');
            const examCd = block.getAttribute('data-exam-cd');
            const examNm = block.getAttribute('data-exam-nm');
            const patient = block.getAttribute('data-patient');
            const time = block.getAttribute('data-time');
            const duration = block.getAttribute('data-duration');

            balloon.innerHTML = `
                <div class="balloon-title">${examNm}</div>
                <div class="balloon-row"><span class="balloon-label">검사코드</span><span class="balloon-value">${examCd}</span></div>
                <div class="balloon-row"><span class="balloon-label">자원</span><span class="balloon-value">${resource}</span></div>
                <div class="balloon-row"><span class="balloon-label">환자ID</span><span class="balloon-value">${patient}</span></div>
                <div class="balloon-row"><span class="balloon-label">예약시간</span><span class="balloon-value">${time} (${duration}분)</span></div>
            `;
            balloon.style.display = 'block';
            moveBalloon(e);
        }

        function moveBalloon(e) {
            const x = e.clientX + 15;
            const y = e.clientY - balloon.offsetHeight - 15;
            balloon.style.left = x + 'px';
            balloon.style.top = (y < 10 ? e.clientY + 20 : y) + 'px';
        }

        function hideBalloon() {
            balloon.style.display = 'none';
        }

        function render() {
            if (currentView === 'day') {
                renderSchedule();
            } else {
                renderWeekSchedule();
            }
        }

        function getWeekDates(baseDate) {
            const date = new Date(baseDate);
            const day = date.getDay();
            const monday = new Date(date);
            monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));

            const dates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                dates.push(d.toISOString().split('T')[0]);
            }
            return dates;
        }

        function renderWeekSchedule() {
            const selectedDate = document.getElementById('dateSelect').value;
            const selectedEquip = document.getElementById('equipSelect').value;
            const weekDates = getWeekDates(selectedDate);

            const weekDayNames = ['월', '화', '수', '목', '금', '토', '일'];

            // 해당 주의 예약 필터링
            let weekReservations = reservations.filter(r => weekDates.includes(r.date));
            if (selectedEquip !== 'ALL') {
                weekReservations = weekReservations.filter(r => r.equipment_type === selectedEquip);
            }

            document.getElementById('stats').textContent =
                `${weekDates[0]} ~ ${weekDates[6]} | 총 예약: ${weekReservations.length}건`;

            const container = document.getElementById('schedule-container');
            container.innerHTML = '';

            if (weekReservations.length === 0) {
                container.innerHTML = '<div class="no-data">해당 주에 예약이 없습니다.</div>';
                return;
            }

            // 장비별로 표시
            const equipTypes = selectedEquip === 'ALL' ? ['CT', 'MRI', 'US', 'NM', 'ENDO', 'FUNC', 'XRAY', 'FLUORO'] : [selectedEquip];

            equipTypes.forEach(equipType => {
                const equipReservations = weekReservations.filter(r => r.equipment_type === equipType);
                if (equipReservations.length === 0) return;

                const equipRes = resources[equipType] || [];

                const section = document.createElement('div');
                section.className = 'equipment-section';

                const title = document.createElement('div');
                title.className = 'equipment-title';
                title.textContent = `🏥 ${equipType} (${equipReservations.length}건) - ${equipRes.join(', ')}`;
                section.appendChild(title);

                // 그리드 생성
                const grid = document.createElement('div');
                grid.className = 'week-grid';

                // 헤더 행 (날짜) - 클릭하면 해당 날짜 선택
                grid.innerHTML = '<div class="week-header">시간</div>';
                weekDates.forEach((date, i) => {
                    const isToday = date === selectedDate;
                    const dayNum = date.split('-')[2];
                    grid.innerHTML += `<div class="week-header ${isToday ? 'today' : ''}" style="cursor:pointer;" data-date="${date}" onclick="selectDate('${date}')">${weekDayNames[i]} ${dayNum}일</div>`;
                });

                // 자원 번호 행 (날짜 아래)
                grid.innerHTML += '<div class="week-resource-header"></div>';
                weekDates.forEach(date => {
                    let resHeaderHtml = '<div class="week-resource-row">';
                    equipRes.forEach(resourceId => {
                        const resNum = resourceId.split('_')[1];
                        resHeaderHtml += `<div class="week-resource-label">${resNum}</div>`;
                    });
                    resHeaderHtml += '</div>';
                    grid.innerHTML += resHeaderHtml;
                });

                // 시간 슬롯: FUNC 장비 선택 시 22시까지, 그 외 16시까지 (30분 단위)
                const weekEndHour = (equipType === 'FUNC') ? 22 : 16;
                for (let h = 8; h < weekEndHour; h++) {
                    // 정각에 시간 셀 추가 (2행 병합: 30분 x 2 = 1시간)
                    const timeStr = `${h.toString().padStart(2,'0')}:00`;
                    const timeCell = document.createElement('div');
                    timeCell.className = 'week-time-cell';
                    timeCell.style.gridRow = 'span 2';
                    timeCell.textContent = timeStr;
                    grid.appendChild(timeCell);

                    for (let m = 0; m < 60; m += 30) {
                        const slotTimeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                        const isHourEnd = (m === 30); // 정각 직전 슬롯

                        // 각 요일 셀
                        weekDates.forEach(date => {
                            const cell = document.createElement('div');
                            cell.className = 'week-cell' + (isHourEnd ? ' hour-end' : '');

                            // 해당 시간대의 예약 찾기 (30분 범위), 자원별로 정렬
                            const slotStart = new Date(`${date} ${slotTimeStr}`);
                            const slotEnd = new Date(slotStart.getTime() + 30 * 60000);

                            // 각 자원별로 고정 위치에 표시
                            equipRes.forEach(resourceId => {
                                const resReservation = equipReservations.find(r => {
                                    const rStart = new Date(r.start);
                                    const rEnd = new Date(r.end);
                                    return r.resource_id === resourceId && r.date === date && rStart < slotEnd && rEnd > slotStart;
                                });

                                const resNum = resourceId.split('_')[1];
                                if (resReservation) {
                                    const r = resReservation;
                                    const rStart = new Date(r.start);
                                    let rEnd = new Date(r.end);

                                    // 그리드 종료 시간을 넘어가면 잘라서 표시
                                    const gridEnd = new Date(`${date} ${weekEndHour.toString().padStart(2,'0')}:00`);
                                    if (rEnd > gridEnd) rEnd = gridEnd;

                                    // 이 슬롯이 예약의 시작 슬롯인지 확인
                                    const isStartSlot = rStart.getTime() >= slotStart.getTime() && rStart.getTime() < slotEnd.getTime();

                                    if (isStartSlot) {
                                        // 시작 슬롯에서만 전체 블록을 그림
                                        const color = equipColors[equipType];
                                        const blockId = `${r.resource_id}_${r.start}`.replace(/[: ]/g, '_');
                                        const slotDuration = 30 * 60000; // 30분 in ms

                                        // 시작 위치 (슬롯 내에서의 offset)
                                        const topPercent = ((rStart.getTime() - slotStart.getTime()) / slotDuration) * 100;
                                        // 전체 예약 높이 (여러 슬롯에 걸칠 수 있음)
                                        const heightPercent = ((rEnd.getTime() - rStart.getTime()) / slotDuration) * 100;

                                        cell.innerHTML += `
                                            <div class="week-block-wrapper">
                                                <div class="week-block" style="background:${color}; top:${topPercent}%; height:${heightPercent}%;"
                                                     data-block-id="${blockId}"
                                                     data-resource="${resourceId}"
                                                     data-exam-cd="${r.exam_cd}"
                                                     data-exam-nm="${r.exam_nm}"
                                                     data-patient="${r.patient_id}"
                                                     data-time="${r.time}"
                                                     data-duration="${r.duration}">
                                                </div>
                                            </div>`;
                                    } else {
                                        // 시작 슬롯이 아니면 빈 wrapper만
                                        cell.innerHTML += `<div class="week-block-wrapper"></div>`;
                                    }
                                } else {
                                    // 빈 슬롯
                                    cell.innerHTML += `<div class="week-block-wrapper"></div>`;
                                }
                            });

                            grid.appendChild(cell);
                        });
                    }
                }

                section.appendChild(grid);
                container.appendChild(section);
            });

            // hover 이벤트 - 말풍선 표시
            container.querySelectorAll('.week-block:not(.empty)').forEach(block => {
                block.addEventListener('mouseenter', function(e) {
                    const blockId = this.getAttribute('data-block-id');
                    document.querySelectorAll(`.week-block[data-block-id="${blockId}"]`).forEach(b => {
                        b.classList.add('highlight');
                    });
                    showBalloon(this, e);
                });
                block.addEventListener('mousemove', function(e) {
                    moveBalloon(e);
                });
                block.addEventListener('mouseleave', function() {
                    const blockId = this.getAttribute('data-block-id');
                    document.querySelectorAll(`.week-block[data-block-id="${blockId}"]`).forEach(b => {
                        b.classList.remove('highlight');
                    });
                    hideBalloon();
                });
            });
        }

        function moveDate(days) {
            const dateInput = document.getElementById('dateSelect');
            const currentDate = new Date(dateInput.value);
            currentDate.setDate(currentDate.getDate() + days);
            const newDateStr = currentDate.toISOString().split('T')[0];
            if (newDateStr >= '2026-01-01' && newDateStr <= '2026-12-31') {
                dateInput.value = newDateStr;
                render();
            }
        }

        document.getElementById('dateSelect').addEventListener('change', render);
        document.getElementById('equipSelect').addEventListener('change', render);

        // 초기 렌더링
        render();
    </script>
</body>
</html>
'''

# HTML 파일 저장
output_path = r'c:\Users\user\Desktop\검사규칙 합성데이터\web\schedule_viewer.html'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print(f'HTML 파일 생성 완료: {output_path}')
print(f'총 예약 데이터: {len(reservation)}건')
print(f'브라우저에서 열어주세요!')
