use std::path::PathBuf;
use std::process::Command;

pub fn get_ffmpeg_path() -> PathBuf {
    // 1. Explicit environment variable
    if let Ok(p) = std::env::var("FFMPEG_PATH") {
        let pb = PathBuf::from(&p);
        if pb.exists() {
            return pb;
        }
    }

    // 2. Binary in the same directory as the recorder-daemon executable
    // (In packaged Electron production, recorder-daemon and ffmpeg both live in resources/bin/)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(dir) = exe_path.parent() {
            let exe_name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
            let candidate = dir.join(exe_name);
            if candidate.exists() {
                return candidate;
            }

            // Also check relative to workspace/repo root during development:
            // e.g. from target/debug or target/release up to bin/ffmpeg.exe or node_modules/ffmpeg-static/
            let mut curr = dir.to_path_buf();
            for _ in 0..4 {
                let bin_candidate = curr.join("bin").join(exe_name);
                if bin_candidate.exists() {
                    return bin_candidate;
                }
                let node_candidate = curr.join("node_modules").join("ffmpeg-static").join(exe_name);
                if node_candidate.exists() {
                    return node_candidate;
                }
                if let Some(parent) = curr.parent() {
                    curr = parent.to_path_buf();
                } else {
                    break;
                }
            }
        }
    }

    // 3. Current working directory relative paths
    let exe_name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let cwd_bin = PathBuf::from("bin").join(exe_name);
    if cwd_bin.exists() {
        if let Ok(canonical) = cwd_bin.canonicalize() {
            return canonical;
        }
        return cwd_bin;
    }
    let cwd_node = PathBuf::from("node_modules").join("ffmpeg-static").join(exe_name);
    if cwd_node.exists() {
        if let Ok(canonical) = cwd_node.canonicalize() {
            return canonical;
        }
        return cwd_node;
    }

    // 4. Fallback to system PATH
    PathBuf::from("ffmpeg")
}

pub fn ffmpeg_cmd() -> Command {
    let path = get_ffmpeg_path();
    Command::new(path)
}
