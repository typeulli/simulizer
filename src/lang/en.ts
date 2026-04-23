import langpack from "@/lang/lang";
const en: langpack = {
    meta: {
        langc: "en",
        name: "English"
    },
    messages: {
        welcome: "Welcome",
        loading: "Loading...",
        error: "An error occurred"
    },
    workspace: {
        compile: {
            block_to_ast: "📦 Block → simphy AST conversion in progress..."
        },
        blocks: {
            not: "! $0",
            not_tooltip: "Logical NOT (eqz)",
            return_i32: "return i32 $0",
            return_i32_tooltip: "i32 return",
            return_f64: "return f64 $0",
            return_f64_tooltip: "f64 return",
            func_main: "function main → $0",
            func_main_body: "body $0",
            func_main_tooltip: "WebAssembly main function",
            custom_func_tooltip: "User-defined function: $0",
            custom_func_call_tooltip: "$0 function call",
        },
        ui: {
            header_title: "Blocky Simulation",
            run_button_running: "⏳ Running...",
            run_button: "▶ Compile & Run",
            wat_button: "📄 WAT",
            blocks_button: "📁 File",
            func_button: "⊕ Functions",
            reset_button: "↺ Reset",
            backend_webgpu: "webgpu",
            backend_webgl: "webgl",
            backend_cpu: "cpu",
            status_waiting: "Waiting",
            status_converting: "Converting",
            status_running: "Running",
            status_done: "Done",
            status_error: "Error",
            result_header: "Result & Log",
            output_label: "Output",
            log_placeholder: "▶ Click the Run button to start",
            export_button: "Export",
            import_button: "Import",
            name_input_placeholder: "Name",
            save_local_button: "Save Local",
            save_file_button: "Save File",
            copy_button: "Copy",
            open_file_button: "Open File",
            apply_button: "Apply",
            xml_textarea_placeholder: "Paste XML or open a file...",
            func_mgr_title: "⊕ Custom Function Manager",
            func_empty_message: "No registered custom functions",
            call_insert_button: "insert call",
            delete_button: "Delete",
            add_func_section: "Add New Function",
            func_name_placeholder: "Function name",
            add_param_button: "+ Parameter",
            add_button: "Add",
            wat_viewer_title: "📄 Generated WAT",
        },
        alerts: {
            func_name_required: "Please enter a function name.",
            invalid_identifier: "Please enter a valid identifier.",
            func_name_exists: "Function name already exists.",
            name_required: "Please enter a name.",
            xml_parse_error: "JSON parse error: Please enter valid block data.\nError: $0",
            xml_corrupted: "Saved block data is corrupted.\nError: $0",
        },
        logs: {
            main_block_not_found: "wasm_func_main block not found.",
            ast_complete: "✅ AST complete — Return: $0, Local variables: $1, body: $2 nodes",
            func_block_not_found: "Function '$0' block not found.",
            func_compile_complete: "✅ Function '$0' compilation complete",
            wat_generated: "✅ WAT generation complete",
            wat_compiling: "🔧 WAT → WASM compiling...",
            wasm_complete: "✅ WASM complete ($0 bytes)",
            running_worker: "🚀 Running in Worker...",
            error_prefix: "❌ $0",
            worker_error: "❌ Worker error: $0",
        }
    }
}
export default en;