#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// 도구 함수들 임포트
import { getPatientInfo, getPatientInfoTool } from './tools/get-patient-info.js';
import { getExamByCode, getExamByCodeTool } from './tools/get-exam-by-code.js';
import { getExamConstraints, getExamConstraintsTool } from './tools/get-exam-constraints.js';
import { getUnavailableSlots, getUnavailableSlotsTool } from './tools/get-unavailable-slots.js';

// MCP 서버 생성
const server = new Server(
    {
        name: 'hospital-reservation-mcp-server',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// 도구 목록 반환
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            getPatientInfoTool,
            getExamByCodeTool,
            getExamConstraintsTool,
            getUnavailableSlotsTool,
        ],
    };
});

// 도구 실행
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        let result;

        switch (name) {
            case 'get_patient_info':
                result = getPatientInfo(args.patient_id);
                break;

            case 'get_exam_by_code':
                result = getExamByCode(args.exam_code);
                break;

            case 'get_exam_constraints':
                result = getExamConstraints(args.exam_code);
                break;

            case 'get_unavailable_slots':
                result = getUnavailableSlots(
                    args.equipment_type,
                    args.start_date,
                    args.end_date,
                    args.patient_id,
                    args.exam_code
                );
                break;

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: error.message,
                    }),
                },
            ],
            isError: true,
        };
    }
});

// 서버 시작
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Hospital Reservation MCP Server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
