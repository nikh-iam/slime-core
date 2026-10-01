use std::os::windows::{io::AsRawHandle, process::CommandExt};
use std::{
    io,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};
use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    },
};

pub fn executable(root: &Path) -> PathBuf {
    root.join("ai/runtimes/llama_cpp/llama-server.exe")
}
/// Windows ownership adapter. Closing the job also terminates the model on host crashes.
pub struct ModelProcess {
    child: Child,
    job: HANDLE,
}
// The owned job handle is only used for shutdown; Child access is externally serialized.
unsafe impl Send for ModelProcess {}
impl ModelProcess {
    pub fn spawn(executable: &Path, args: &[String]) -> io::Result<Self> {
        unsafe {
            let job = CreateJobObjectW(None, None).map_err(io::Error::other)?;
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if let Err(error) = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of_val(&info) as u32,
            ) {
                let _ = CloseHandle(job);
                return Err(io::Error::other(error));
            }
            let child = Command::new(executable)
                .args(args)
                .creation_flags(0x08000000)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .spawn();
            let mut child = match child {
                Ok(child) => child,
                Err(error) => {
                    let _ = CloseHandle(job);
                    return Err(error);
                }
            };
            if let Err(error) = AssignProcessToJobObject(job, HANDLE(child.as_raw_handle())) {
                let _ = child.kill();
                let _ = child.wait();
                let _ = CloseHandle(job);
                return Err(io::Error::other(error));
            }
            if let Some(stderr) = child.stderr.take() {
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                        if line.contains("buffer size")
                            || line.contains("model type")
                            || line.contains("model params")
                            || line.contains("model arch")
                            || line.contains("server is listening")
                            || line.starts_with("error")
                        {
                            log::info!("Local model: {line}");
                        }
                    }
                });
            }
            Ok(Self { child, job })
        }
    }
    pub fn running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}
impl Drop for ModelProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        unsafe {
            let _ = CloseHandle(self.job);
        }
    }
}
