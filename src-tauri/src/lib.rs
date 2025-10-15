use comrak::{markdown_to_html, ComrakOptions};
use tauri::{Emitter, Manager};
use tauri_plugin_cli::CliExt;

#[tauri::command]
fn parse_markdown(content: String) -> String {
    let mut options = ComrakOptions::default();
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.tasklist = true;
    markdown_to_html(&content, &options)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_cli::init())
        .setup(|app| {
            // CLI-Argumente verarbeiten
            if let Ok(matches) = app.cli().matches() {
                if let Some(file_path) = matches.args.get("file") {
                    if let Some(path_str) = file_path.value.as_str() {
                        // Sende den Dateipfad ans Frontend
                        let window = app.get_webview_window("main").unwrap();
                        window.emit("cli-open-file", path_str).unwrap();
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}