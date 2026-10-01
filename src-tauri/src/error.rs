use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Native window operation failed: {0}")]
    Window(#[from] tauri::Error),
    #[error("Local storage failed: {0}")]
    Storage(#[from] rusqlite::Error),
    #[error("Local data directory failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0} is unavailable in Phase 0")]
    Unavailable(&'static str),
    #[error("Internal state is unavailable")]
    State,
    #[error("Configuration error: {0}")]
    Configuration(String),
    #[error("Database schema {0} is newer than this application supports")]
    Schema(i64),
}

#[derive(Serialize)]
pub struct CommandError {
    code: &'static str,
    message: String,
}

impl From<AppError> for CommandError {
    fn from(error: AppError) -> Self {
        log::error!("{error}");
        let code = match error {
            AppError::Unavailable(_) => "unavailable",
            AppError::Storage(_) | AppError::Io(_) | AppError::Schema(_) => "storage",
            AppError::Window(_) => "window",
            AppError::State => "state",
            AppError::Configuration(_) => "configuration",
        };
        Self {
            code,
            message: error.to_string(),
        }
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
