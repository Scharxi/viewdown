use std::env;
use std::path::PathBuf;
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
        .invoke_handler(tauri::generate_handler![parse_markdown])
        .setup(|app| {
            println!("App setup started...");

            // CLI-Argumente verarbeiten
            match app.cli().matches() {
                Ok(matches) => {
                    println!("CLI matches: {:?}", matches);

                    if let Some(file_arg) = matches.args.get("file") {
                        println!("File argument found: {:?}", file_arg);

                        if let Some(path_str) = file_arg.value.as_str() {
                            println!("Opening file from CLI: {}", path_str);

                            // Konvertiere zu absolutem Pfad
                            let mut path = PathBuf::from(path_str);
                            if path.is_relative() {
                                if let Ok(current_dir) = env::current_dir() {
                                    path = current_dir.join(path);
                                }
                            }

                            let absolute_path = path.to_string_lossy().to_string();
                            println!("Absolute path: {}", absolute_path);

                            // Warte kurz, damit das Frontend bereit ist
                            let window = app.get_webview_window("main").unwrap();

                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(500));
                                println!("Emitting cli-open-file event with path: {}", absolute_path);
                                window.emit("cli-open-file", &absolute_path).unwrap();
                            });
                        } else {
                            println!("File argument is not a string");
                        }
                    } else {
                        println!("No file argument provided");
                    }
                }
                Err(e) => {
                    println!("Error parsing CLI arguments: {:?}", e);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}