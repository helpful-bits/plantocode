use tauri::{AppHandle, Manager, Emitter, Listener};
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use std::sync::{Arc, RwLock};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnState { Connected, Disconnected, Error }

pub struct TrayController {
    icon: TrayIcon,
    state: Arc<RwLock<ConnState>>,
}

impl TrayController {
    pub fn init(app: &AppHandle) -> tauri::Result<Self> {
        let show_hide_item = MenuItemBuilder::new("Show Window").id("tray-show-hide").build(app)?;
        let status_item = MenuItemBuilder::new("Connection: Disconnected").id("tray-connection-status").enabled(false).build(app)?;
        let diagnostics_item = MenuItemBuilder::new("Diagnostics").id("tray-diagnostics").build(app)?;
        let disconnect_item = MenuItemBuilder::new("Disconnect All").id("tray-disconnect-all").build(app)?;
        let settings_item = MenuItemBuilder::new("Settings").id("tray-settings").build(app)?;
        let quit_item = MenuItemBuilder::new("Quit").id("tray-quit").build(app)?;

        let menu = Menu::with_items(app, &[
            &show_hide_item,
            &PredefinedMenuItem::separator(app)?,
            &status_item,
            &PredefinedMenuItem::separator(app)?,
            &diagnostics_item,
            &disconnect_item,
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ])?;

        let icon = TrayIconBuilder::new()
            .icon(app.default_window_icon().cloned().unwrap())
            .icon_as_template(cfg!(target_os = "macos"))
            .menu(&menu)
            .menu_on_left_click(true)
            .on_menu_event({
                let app = app.clone();
                move |_app, event| {
                    match event.id().as_ref() {
                        "tray-show-hide" => {
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                        "tray-settings" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                            let _ = app.emit("open-settings", ());
                        }
                        "tray-diagnostics" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                            let _ = app.emit("open-settings", ());
                        }
                        "tray-disconnect-all" => {
                            let _ = app.emit("terminate-connections", ());
                        }
                        "tray-quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                }
            })
            .build(app)?;

        let controller = Self {
            icon,
            state: Arc::new(RwLock::new(ConnState::Disconnected)),
        };

        let app2 = app.clone();
        let state2 = controller.state.clone();
        app.listen("device-link-status", move |e| {
            let payload = e.payload();
            if payload.contains("\"auth_failed\"") || payload.contains("\"error\"") {
                TrayController::update_status_impl(&app2, &state2, ConnState::Error);
            } else if payload.contains("\"registered\"") || payload.contains("\"resumed\"") || payload.contains("\"connected\"") {
                TrayController::update_status_impl(&app2, &state2, ConnState::Connected);
            } else if payload.contains("\"disconnected\"") || payload.contains("\"reconnecting\"") {
                TrayController::update_status_impl(&app2, &state2, ConnState::Disconnected);
            }
        });

        Ok(controller)
    }

    pub fn update_status(&self, app: &AppHandle, state: ConnState) {
        Self::update_status_impl(app, &self.state, state);
    }

    fn update_status_impl(app: &AppHandle, state: &Arc<RwLock<ConnState>>, new_state: ConnState) {
        if let Ok(mut s) = state.write() {
            *s = new_state;
        }

        let label = match new_state {
            ConnState::Connected => "Connection: Connected",
            ConnState::Disconnected => "Connection: Disconnected",
            ConnState::Error => "Connection: Error",
        };

        if let Some(tray) = app.tray_by_id("main") {
            if let Some(icon) = app.default_window_icon() {
                let _ = tray.set_icon(Some(icon.clone()));
            }
        }

        if let Some(menu) = app.menu() {
            if let Some(item) = menu.get("tray-connection-status") {
                let _ = item.as_menuitem().map(|i| i.set_text(label));
            }
        }
    }
}
