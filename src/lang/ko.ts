import langpack from "@/lang/lang";
const ko: langpack = {
    meta: {
        langc: "ko",
        name: "한국어"
    },
    messages: {
        welcome: "환영합니다",
        loading: "로딩 중...",
        error: "오류가 발생했습니다"
    },
    workspace: {
        compile: {
            block_to_ast: "📦 블록 → simphy AST 변환 중..."
        },
        blocks: {
            not: "! $0",
            not_tooltip: "논리 NOT (eqz)",
            return_i32: "반환 i32 $0",
            return_i32_tooltip: "i32 반환",
            return_f64: "반환 f64 $0",
            return_f64_tooltip: "f64 반환",
            func_main: "함수 main → $0",
            func_main_body: "본문 $0",
            func_main_tooltip: "WebAssembly main 함수",
            custom_func_tooltip: "사용자 정의 함수: $0",
            custom_func_call_tooltip: "$0 함수 호출",
        },
        ui: {
            header_title: "Blocky Simulation",
            run_button_running: "⏳ 실행 중...",
            run_button: "▶ 컴파일 & 실행",
            wat_button: "📄 WAT",
            blocks_button: "📁 파일",
            func_button: "⊕ 함수",
            reset_button: "↺ 초기화",
            backend_webgpu: "webgpu",
            backend_webgl: "webgl",
            backend_cpu: "cpu",
            status_waiting: "대기",
            status_converting: "변환 중",
            status_running: "실행 중",
            status_done: "완료",
            status_error: "오류",
            result_header: "결과 & 로그",
            output_label: "Output",
            log_placeholder: "▶ 실행 버튼을 눌러 시작하세요",
            export_button: "내보내기",
            import_button: "불러오기",
            name_input_placeholder: "이름",
            save_local_button: "로컬 저장",
            save_file_button: "파일 저장",
            copy_button: "복사",
            open_file_button: "파일 열기",
            apply_button: "적용",
            xml_textarea_placeholder: "XML을 붙여넣거나 파일을 여세요...",
            func_mgr_title: "⊕ 커스텀 함수 관리",
            func_empty_message: "등록된 커스텀 함수 없음",
            call_insert_button: "call 삽입",
            delete_button: "삭제",
            add_func_section: "새 함수 추가",
            func_name_placeholder: "함수 이름",
            add_param_button: "+ 파라미터",
            add_button: "추가",
            wat_viewer_title: "📄 생성된 WAT",
        },
        alerts: {
            func_name_required: "함수 이름을 입력하세요.",
            invalid_identifier: "유효한 식별자를 입력하세요.",
            func_name_exists: "이미 존재하는 함수 이름입니다.",
            name_required: "이름을 입력하세요.",
            xml_parse_error: "JSON 파싱 오류: 올바른 블록 데이터를 입력하세요.\n오류: $0",
            xml_corrupted: "저장된 블록 데이터가 손상되었습니다.\n오류: $0",
        },
        logs: {
            main_block_not_found: "wasm_func_main 블록을 찾을 수 없습니다.",
            ast_complete: "✅ AST 완료 — 반환: $0, 지역변수: $1개, body: $2노드",
            func_block_not_found: "함수 '$0' 블록을 찾을 수 없습니다.",
            func_compile_complete: "✅ 함수 '$0' 컴파일 완료",
            wat_generated: "✅ WAT 생성 완료",
            wat_compiling: "🔧 WAT → WASM 컴파일 중...",
            wasm_complete: "✅ WASM 완료 ($0 bytes)",
            running_worker: "🚀 Worker에서 실행 중...",
            error_prefix: "❌ $0",
            worker_error: "❌ Worker 오류: $0",
        }
    }
}
export default ko;