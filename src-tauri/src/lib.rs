use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};

/// Đóng cửa sổ = thu nhỏ xuống khay (app vẫn chạy nền để nhắc việc)
struct MinimizeToTray(AtomicBool);

#[tauri::command]
fn set_minimize_to_tray(state: tauri::State<MinimizeToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Mở app lần 2 -> đưa cửa sổ đang chạy lên trước
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(MinimizeToTray(AtomicBool::new(true)))
        .invoke_handler(tauri::generate_handler![set_minimize_to_tray])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Mở Project Manager", true, None::<&str>)?;
            let my_day = MenuItem::with_id(app, "my-day", "My Day", true, None::<&str>)?;
            let add = MenuItem::with_id(app, "add", "Thêm task", true, None::<&str>)?;
            let today = MenuItem::with_id(app, "today", "Task hôm nay", true, None::<&str>)?;
            let notifications = MenuItem::with_id(app, "notifications", "Thông báo", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open, &my_day, &add, &today, &notifications, &separator, &quit],
            )?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Project Manager")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let command = match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                            return;
                        }
                        "my-day" => Some("/my-day"),
                        "add" => Some("quick-add"),
                        "today" => Some("/my-day"),
                        "notifications" => Some("/notifications"),
                        _ => None,
                    };
                    show_main(app);
                    if let Some(cmd) = command {
                        let _ = app.emit("tray-command", cmd);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Được Windows khởi động cùng hệ thống -> chạy ẩn ở khay
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let minimize = window.app_handle().state::<MinimizeToTray>().0.load(Ordering::Relaxed);
                if minimize {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Project Manager");
}
